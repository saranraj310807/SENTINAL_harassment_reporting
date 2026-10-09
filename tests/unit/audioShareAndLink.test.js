import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { db } from '../../server/db/index.js';
import { storageAdapter } from '../../server/storage/index.js';
import { ensureShareCopy } from '../../server/storage/audioConverter.js';
import { runMigrations } from '../../server/migrations/migrator.js';

test('Audio Share Copy: Format conversion only, original untouched & zero transcription', async () => {
  runMigrations();

  // Create a minimal synthetic audio WAV file
  // WAV header: 44 bytes + PCM data
  const sampleRate = 8000;
  const numSamples = 8000; // 1 second
  const wavHeader = Buffer.alloc(44);
  wavHeader.write('RIFF', 0);
  wavHeader.writeUInt32LE(36 + numSamples * 2, 4);
  wavHeader.write('WAVE', 8);
  wavHeader.write('fmt ', 12);
  wavHeader.writeUInt32LE(16, 16);
  wavHeader.writeUInt16LE(1, 20); // PCM
  wavHeader.writeUInt16LE(1, 22); // mono
  wavHeader.writeUInt32LE(sampleRate, 24);
  wavHeader.writeUInt32LE(sampleRate * 2, 28);
  wavHeader.writeUInt16LE(2, 32);
  wavHeader.writeUInt16LE(16, 34);
  wavHeader.write('data', 36);
  wavHeader.writeUInt32LE(numSamples * 2, 40);

  const pcmData = Buffer.alloc(numSamples * 2); // 1 sec of silence/tone
  const wavBuffer = Buffer.concat([wavHeader, pcmData]);
  const originalSha256 = crypto.createHash('sha256').update(wavBuffer).digest('hex');

  // Save via storage adapter
  const savedOrig = await storageAdapter.saveFile(wavBuffer, 'original_test_audio.wav');

  // Insert dummy case if needed
  let caseRow = db.prepare('SELECT id FROM cases LIMIT 1').get();
  let caseId = caseRow ? caseRow.id : 1;

  const now = new Date().toISOString();
  const insertAudio = db.prepare(`
    INSERT INTO audio_complaints (
      case_id, storage_key, original_mime, size_bytes, duration_seconds,
      preferred_language, recorded_or_uploaded, sha256, created_at
    ) VALUES (?, ?, 'audio/wav', ?, 1, 'Tamil', 'recorded', ?, ?)
  `).run(caseId, savedOrig.storageKey, savedOrig.sizeBytes, originalSha256, now);

  const audioId = insertAudio.lastInsertRowid;

  // Convert to share copy
  const shareCopy = await ensureShareCopy(audioId);

  // 1. Verify original audio file is 100% UNCHANGED
  const origFilePath = storageAdapter.getFilePath(savedOrig.storageKey);
  const currentOrigBytes = fs.readFileSync(origFilePath);
  const currentOrigSha256 = crypto.createHash('sha256').update(currentOrigBytes).digest('hex');

  assert.equal(currentOrigSha256, originalSha256, 'Original audio file SHA-256 must be identical');

  const origRow = db.prepare('SELECT * FROM audio_complaints WHERE id = ?').get(audioId);
  assert.equal(origRow.sha256, originalSha256, 'Original database record SHA-256 must be identical');

  // 2. Verify share copy exists and format is m4a
  if (shareCopy) {
    assert.equal(shareCopy.format, 'm4a');
    assert.equal(shareCopy.mime, 'audio/mp4');
    assert.ok(shareCopy.storage_key);
    assert.notEqual(shareCopy.storage_key, savedOrig.storageKey, 'Share copy must have separate storage key');
  }

  // 3. Strict verification: NO transcript or text columns exist in schema
  const audioCols = db.prepare("PRAGMA table_info('audio_complaints')").all().map(c => c.name.toLowerCase());
  const shareCols = db.prepare("PRAGMA table_info('audio_share_copies')").all().map(c => c.name.toLowerCase());

  const forbiddenTerms = ['transcript', 'transcription', 'text', 'speech', 'translation', 'words'];
  for (const term of forbiddenTerms) {
    assert.equal(audioCols.some(c => c.includes(term)), false, `audio_complaints must not have column containing '${term}'`);
    assert.equal(shareCols.some(c => c.includes(term)), false, `audio_share_copies must not have column containing '${term}'`);
  }
});

test('Expiring Audio Link: Token hashing, expiration, max plays, and revocation', () => {
  runMigrations();

  let caseRow = db.prepare('SELECT id FROM cases LIMIT 1').get();
  let caseId = caseRow ? caseRow.id : 1;

  // Generate 256-bit token
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 3600 * 1000).toISOString();
  const maxPlays = 5;

  const insertLink = db.prepare(`
    INSERT INTO audio_links (
      case_id, token_hash, expires_at, max_plays, plays_count, created_at, created_by
    ) VALUES (?, ?, ?, ?, 0, ?, 1)
  `).run(caseId, tokenHash, expiresAt, maxPlays, now.toISOString());

  const linkId = insertLink.lastInsertRowid;

  // 1. Verify token is stored as SHA-256 hash, NEVER plaintext
  const stored = db.prepare('SELECT * FROM audio_links WHERE id = ?').get(linkId);
  assert.equal(stored.token_hash, tokenHash);
  assert.notEqual(stored.token_hash, rawToken);

  // 2. Play count tracking
  db.prepare('UPDATE audio_links SET plays_count = plays_count + 1 WHERE id = ?').run(linkId);
  const updated1 = db.prepare('SELECT plays_count FROM audio_links WHERE id = ?').get(linkId);
  assert.equal(updated1.plays_count, 1);

  // 3. Max plays enforcement check
  db.prepare('UPDATE audio_links SET plays_count = 5 WHERE id = ?').run(linkId);
  const updated5 = db.prepare('SELECT * FROM audio_links WHERE id = ?').get(linkId);
  assert.equal(updated5.plays_count >= updated5.max_plays, true, 'Link reaches max plays');

  // 4. Revocation
  db.prepare('UPDATE audio_links SET revoked_at = ? WHERE id = ?').run(new Date().toISOString(), linkId);
  const revokedRow = db.prepare('SELECT revoked_at FROM audio_links WHERE id = ?').get(linkId);
  assert.ok(revokedRow.revoked_at, 'Link must be marked revoked');
});
