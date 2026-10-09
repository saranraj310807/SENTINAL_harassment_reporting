import ffmpegPath from 'ffmpeg-static';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { config } from '../config/index.js';
import { storageAdapter } from './index.js';
import { logAudit } from '../utils/audit.js';

/**
 * Creates or retrieves a WhatsApp-friendly audio share copy (.m4a AAC)
 * Format conversion ONLY. Never alters original audio, never trims,
 * and NEVER performs speech-to-text, transcription, or translation.
 */
export async function ensureShareCopy(audioComplaintId) {
  const audio = db.prepare('SELECT * FROM audio_complaints WHERE id = ?').get(audioComplaintId);
  if (!audio) return null;

  // Check if a share copy already exists
  const existing = db.prepare('SELECT * FROM audio_share_copies WHERE audio_complaint_id = ? ORDER BY id DESC LIMIT 1').get(audioComplaintId);
  if (existing) {
    const existingPath = storageAdapter.getFilePath(existing.storage_key);
    if (existingPath && fs.existsSync(existingPath)) {
      return existing;
    }
  }

  const origPath = storageAdapter.getFilePath(audio.storage_key);
  if (!origPath || !fs.existsSync(origPath)) {
    return null;
  }

  // If ffmpeg is not available or executable not found, fallback to original
  if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
    console.warn('[AUDIO CONVERTER] ffmpeg-static not available. Sharing original audio file.');
    return null;
  }

  const tempOutputFile = path.join(config.STORAGE_DIR, `temp_share_${crypto.randomUUID()}.m4a`);

  try {
    await new Promise((resolve, reject) => {
      // Command: ffmpeg -y -i <input> -vn -c:a aac -b:a 128k <output.m4a>
      // Strict: Audio format transcoding only. No filter, no transcription, no modification.
      const child = spawn(ffmpegPath, [
        '-y',
        '-i', origPath,
        '-vn',
        '-c:a', 'aac',
        '-b:a', '128k',
        tempOutputFile
      ]);

      let stderr = '';
      child.stderr.on('data', (d) => { stderr += d.toString(); });

      child.on('error', (err) => reject(err));
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
      });
    });

    if (!fs.existsSync(tempOutputFile)) {
      throw new Error('Converted share copy file was not generated.');
    }

    const convertedBuf = fs.readFileSync(tempOutputFile);
    try { fs.unlinkSync(tempOutputFile); } catch {}

    const shareSha256 = crypto.createHash('sha256').update(convertedBuf).digest('hex');
    const saved = await storageAdapter.saveFile(convertedBuf, `SENTINEL-share-${audio.case_id}.m4a`);

    const now = new Date().toISOString();
    const insertResult = db.prepare(`
      INSERT INTO audio_share_copies (
        audio_complaint_id, case_id, storage_key, mime, size_bytes, sha256, format, created_at
      ) VALUES (?, ?, ?, 'audio/mp4', ?, ?, 'm4a', ?)
    `).run(
      audio.id,
      audio.case_id,
      saved.storageKey,
      saved.sizeBytes,
      shareSha256,
      now
    );

    logAudit({
      actorUserId: null,
      actorRole: 'system',
      action: 'AUDIO_SHARE_COPY_CREATED',
      entityType: 'audio_share_copy',
      entityId: insertResult.lastInsertRowid,
      details: {
        audioComplaintId: audio.id,
        caseId: audio.case_id,
        originalSha256: audio.sha256,
        shareSha256,
        sizeBytes: saved.sizeBytes,
        format: 'm4a'
      }
    });

    return {
      id: insertResult.lastInsertRowid,
      audio_complaint_id: audio.id,
      case_id: audio.case_id,
      storage_key: saved.storageKey,
      mime: 'audio/mp4',
      size_bytes: saved.sizeBytes,
      sha256: shareSha256,
      format: 'm4a',
      created_at: now
    };
  } catch (err) {
    try { if (fs.existsSync(tempOutputFile)) fs.unlinkSync(tempOutputFile); } catch {}
    console.warn('[AUDIO CONVERTER] Conversion failed, fallback to original:', err.message);
    return null;
  }
}
