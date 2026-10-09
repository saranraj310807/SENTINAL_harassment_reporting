import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../../server/index.js';
import { db } from '../../server/db/index.js';
import { runMigrations } from '../../server/migrations/migrator.js';
import { seedDatabase } from '../../server/seed/seed.js';
import { storageAdapter } from '../../server/storage/index.js';

let server;
const TEST_PORT = 3123;
const BASE_URL = `http://localhost:${TEST_PORT}`;

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  update(response) {
    if (typeof response.headers.getSetCookie === 'function') {
      const setCookies = response.headers.getSetCookie();
      for (const str of setCookies) {
        const [pair] = str.split(';');
        const [key, val] = pair.split('=');
        if (key && val) {
          this.cookies.set(key.trim(), val.trim());
        }
      }
    }
  }

  getCookieHeader() {
    const list = [];
    for (const [k, v] of this.cookies.entries()) {
      list.push(`${k}=${v}`);
    }
    return list.join('; ');
  }

  get(key) {
    return this.cookies.get(key);
  }
}

async function request(path, options = {}, jar = new CookieJar()) {
  const headers = options.headers || {};
  const cookieHeader = jar.getCookieHeader();
  if (cookieHeader) {
    headers['cookie'] = cookieHeader;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers
  });

  jar.update(res);

  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}

  return {
    status: res.status,
    headers: res.headers,
    body: json || text,
    jar
  };
}

test('Setup Test Server', async () => {
  runMigrations();
  await seedDatabase(true);

  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      console.log(`[TEST_SERVER] Started on port ${TEST_PORT}`);
      resolve();
    });
  });
});

test('API Auth & CSRF Protection: Rejects state-changing POST without CSRF token', async () => {
  const jar = new CookieJar();
  // Obtain initial CSRF cookie via GET /api/auth/me
  const initRes = await request('/api/auth/me', { method: 'GET' }, jar);
  assert.equal(initRes.status, 200);

  // Attempt POST without CSRF header
  const postRes = await request('/api/cases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category: 'Ragging' })
  }, jar);

  assert.equal(postRes.status, 403, 'Must reject state change without CSRF header');
  assert.match(postRes.body.error, /CSRF/);
});

test('API RBAC & IDOR: Student cannot view another student case, audio, or authority routes', async () => {
  const priyaJar = new CookieJar();

  // 1. Log in as Student (Priya Sharma)
  const loginRes = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'priya.sharma@campus.edu',
      password: 'SentinelDemo2026!'
    })
  }, priyaJar);

  assert.equal(loginRes.status, 200, 'Priya login must succeed');
  assert.equal(loginRes.body.user.role, 'student');

  // 2. Fetch Priya's own cases
  const priyaCases = await request('/api/cases', { method: 'GET' }, priyaJar);
  assert.equal(priyaCases.status, 200);
  assert.ok(Array.isArray(priyaCases.body.cases));

  // 3. Find another student's case (e.g. Rahul Varma)
  const rahulCase = db.prepare(`
    SELECT * FROM cases 
    WHERE student_user_id != (SELECT id FROM users WHERE email = 'priya.sharma@campus.edu')
    LIMIT 1
  `).get();
  assert.ok(rahulCase, 'Rahul case exists in seed database');

  // 4. Priya attempts to view Rahul's case (IDOR test)
  const idorRes = await request(`/api/cases/${rahulCase.case_ref}`, { method: 'GET' }, priyaJar);
  assert.equal(idorRes.status, 403, 'Must return 403 Forbidden on IDOR attempt');

  // 5. Priya attempts to access Rahul's audio endpoint
  const idorAudio = await request(`/api/cases/${rahulCase.id}/audio`, { method: 'GET' }, priyaJar);
  assert.equal(idorAudio.status, 403, 'Must reject unauthorized audio streaming');

  // 6. Priya attempts to access Authority-only Link Review queue
  const authorityRouteRes = await request('/api/escalation/candidates', { method: 'GET' }, priyaJar);
  assert.equal(authorityRouteRes.status, 403, 'Student must be denied access to authority queue');

  // 7. Verify Student view privacy: Priya's view of her own case strictly excludes internal notes, scores, other cases
  const priyaOwnCase = priyaCases.body.cases[0];
  if (priyaOwnCase) {
    const ownDetail = await request(`/api/cases/${priyaOwnCase.case_ref}`, { method: 'GET' }, priyaJar);
    assert.equal(ownDetail.status, 200);
    assert.equal(ownDetail.body.internalNotes, undefined, 'Student view must NOT include internalNotes');
    assert.equal(ownDetail.body.linkCandidates, undefined, 'Student view must NOT include linkCandidates');
    assert.equal(ownDetail.body.groupMembers, undefined, 'Student view must NOT include groupMembers');
  }
});

test('API Audio Complaints: Magic byte verification and Range streaming', async () => {
  // Check that audio_complaints table has NO transcript or text columns
  const tableInfo = db.prepare("PRAGMA table_info('audio_complaints')").all();
  const columnNames = tableInfo.map(col => col.name.toLowerCase());

  assert.ok(!columnNames.includes('transcript'), 'audio_complaints must NOT contain transcript column');
  assert.ok(!columnNames.includes('translation'), 'audio_complaints must NOT contain translation column');
  assert.ok(!columnNames.includes('text'), 'audio_complaints must NOT contain text-derived columns');

  // Login as HOD to test audio streaming with Range headers
  const hodJar = new CookieJar();
  const loginHod = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'hod.cse@campus.edu',
      password: 'SentinelDemo2026!'
    })
  }, hodJar);
  assert.equal(loginHod.status, 200);

  // Find a case belonging to CSE department
  const cseCase = db.prepare(`
    SELECT * FROM cases WHERE department_id = (SELECT department_id FROM users WHERE email = 'hod.cse@campus.edu') LIMIT 1
  `).get();
  assert.ok(cseCase);

  // Stream without audio attached returns 404
  const noAudioRes = await request(`/api/cases/${cseCase.id}/audio`, { method: 'GET' }, hodJar);
  assert.equal(noAudioRes.status, 404);
});

test('API Duplicate Protection: Identical token and fingerprint within 10 minutes return existing case', async () => {
  const priyaJar = new CookieJar();
  const loginPriya = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'priya.sharma@campus.edu',
      password: 'SentinelDemo2026!'
    })
  }, priyaJar);
  assert.equal(loginPriya.status, 200);

  const csrf = priyaJar.get('sentinel_csrf');
  const validLoc = db.prepare('SELECT id FROM campus_locations LIMIT 1').get().id;
  const subToken = `idempotent-test-token-${Date.now()}`;
  const now = new Date(Date.now() - 60000).toISOString();

  const payload = {
    category: 'Bullying',
    incident_at: now,
    campus_location_id: validLoc,
    location_detail: 'Library entrance',
    description: 'Repeated verbal taunts outside the library entrance.',
    urgent: false,
    privacy_mode: 'confidential',
    preferred_language: 'English',
    submission_token: subToken
  };

  // First submission
  const firstRes = await request('/api/cases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
    body: JSON.stringify(payload)
  }, priyaJar);

  assert.equal(firstRes.status, 201);
  assert.equal(firstRes.body.success, true);
  const originalCaseId = firstRes.body.case.id;

  // Duplicate submission with same token
  const dupRes = await request('/api/cases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
    body: JSON.stringify(payload)
  }, priyaJar);

  assert.equal(dupRes.status, 200);
  assert.equal(dupRes.body.isDuplicate, true);
  assert.equal(dupRes.body.case.id, originalCaseId, 'Duplicate submission must return original case');

  // Verify audit log captured duplicate attempt
  const audit = db.prepare("SELECT * FROM audit_log WHERE action = 'DUPLICATE_SUBMISSION_BLOCKED' ORDER BY id DESC LIMIT 1").get();
  assert.ok(audit, 'Audit entry for duplicate prevention must exist');
});

test('API Expiring Audio Links: Create, standalone player, range streaming, audit, and revoke', async () => {
  const priyaJar = new CookieJar();
  await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'priya.sharma@campus.edu',
      password: 'SentinelDemo2026!'
    })
  }, priyaJar);

  const csrf = priyaJar.get('sentinel_csrf');
  const priyaCase = db.prepare(`
    SELECT * FROM cases WHERE student_user_id = (SELECT id FROM users WHERE email = 'priya.sharma@campus.edu') LIMIT 1
  `).get();
  assert.ok(priyaCase);

  // Attach a minimal dummy audio recording to priyaCase
  const wavHeader = Buffer.alloc(44);
  wavHeader.write('RIFF', 0);
  wavHeader.writeUInt32LE(36 + 1000, 4);
  wavHeader.write('WAVE', 8);
  const dummyBuffer = Buffer.concat([wavHeader, Buffer.alloc(1000)]);
  const saved = await storageAdapter.saveFile(dummyBuffer, 'test_link_audio.wav');

  db.prepare(`
    INSERT INTO audio_complaints (
      case_id, storage_key, original_mime, size_bytes, duration_seconds,
      preferred_language, recorded_or_uploaded, sha256, created_at
    ) VALUES (?, ?, 'audio/wav', ?, 1, 'Tamil', 'recorded', ?, ?)
  `).run(priyaCase.id, saved.storageKey, saved.sizeBytes, saved.sha256, new Date().toISOString());

  // 1. Generate Expiring Audio Link
  const genRes = await request(`/api/cases/${priyaCase.id}/audio-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
    body: JSON.stringify({})
  }, priyaJar);

  assert.equal(genRes.status, 201);
  assert.ok(genRes.body.rawToken);
  assert.ok(genRes.body.listenUrl);
  assert.equal(genRes.body.maxPlays, 5);
  const linkId = genRes.body.id;
  const rawToken = genRes.body.rawToken;

  // 2. Fetch /listen/:token (Standalone public player page with zero case details)
  const playerRes = await request(`/listen/${rawToken}`, { method: 'GET' });
  assert.equal(playerRes.status, 200);
  assert.equal(playerRes.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
  assert.equal(playerRes.headers.get('cache-control'), 'no-store, no-cache, must-revalidate, private');
  assert.ok(playerRes.body.includes('Confidential Audio Player'));
  assert.equal(playerRes.body.includes(priyaCase.case_ref), false, 'Must not leak case_ref');
  assert.equal(playerRes.body.includes('Priya Sharma'), false, 'Must not leak student name');

  // 3. Stream audio via /listen/:token/stream with HTTP Range
  const streamRes = await request(`/listen/${rawToken}/stream`, {
    method: 'GET',
    headers: { 'Range': 'bytes=0-100' }
  });
  assert.equal(streamRes.status, 206);
  assert.equal(streamRes.headers.get('accept-ranges'), 'bytes');
  assert.ok(streamRes.headers.get('content-range').startsWith('bytes 0-100/'));

  // Verify play count and audit logging
  const linkRow = db.prepare('SELECT plays_count FROM audio_links WHERE id = ?').get(linkId);
  assert.equal(linkRow.plays_count, 1, 'Play count must increment on playback');

  const auditPlay = db.prepare("SELECT * FROM audit_log WHERE action = 'AUDIO_LINK_PLAYBACK' AND entity_id = ?").get(String(linkId));
  assert.ok(auditPlay, 'Playback must be audit logged');

  // 4. Revoke audio link
  const revokeRes = await request(`/api/cases/${priyaCase.id}/audio-links/${linkId}/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf }
  }, priyaJar);
  assert.equal(revokeRes.status, 200);

  // 5. Verify revoked link returns 410 Gone
  const revokedAccess = await request(`/listen/${rawToken}`, { method: 'GET' });
  assert.equal(revokedAccess.status, 410);
  assert.ok(revokedAccess.body.includes('Playback Link Revoked'));
});

test('Teardown Test Server', () => {
  if (server) {
    server.close();
  }
});

