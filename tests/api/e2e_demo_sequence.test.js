import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../../server/db/index.js';
import { seedDatabase } from '../../server/seed/seed.js';

const BASE_URL = 'http://localhost:3000';

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
        if (key && val) this.cookies.set(key.trim(), val.trim());
      }
    }
  }
  getCookieHeader() {
    const list = [];
    for (const [k, v] of this.cookies.entries()) list.push(`${k}=${v}`);
    return list.join('; ');
  }
  get(key) {
    return this.cookies.get(key);
  }
}

async function apiRequest(path, options = {}, jar = new CookieJar()) {
  const headers = options.headers || {};
  const cookieHeader = jar.getCookieHeader();
  if (cookieHeader) headers['cookie'] = cookieHeader;

  const csrfToken = jar.get('sentinel_csrf');
  if (csrfToken && ['POST', 'PUT', 'PATCH', 'DELETE'].includes((options.method || 'GET').toUpperCase())) {
    headers['x-csrf-token'] = csrfToken;
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  jar.update(res);

  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}

  return { status: res.status, headers: res.headers, body: json || text, jar };
}

test('SENTINEL 15-Step Live Demo End-to-End Workflow', async () => {
  // Step 0: Ensure fresh baseline
  await seedDatabase(true);

  // Step 1: Open session & get CSRF
  const studentJar = new CookieJar();
  const initRes = await apiRequest('/api/auth/me', { method: 'GET' }, studentJar);
  assert.equal(initRes.status, 200);

  // Step 2: Student Login (Priya Sharma)
  const loginRes = await apiRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'priya.sharma@campus.edu', password: 'SentinelDemo2026!' })
  }, studentJar);
  assert.equal(loginRes.status, 200);
  assert.equal(loginRes.body.user.role, 'student');
  assert.equal(loginRes.body.user.studentProfile.sif_number, 'SIF202601');

  // Step 3: Fetch Locations and Cameras for Complaint
  const locsRes = await apiRequest('/api/meta/locations', { method: 'GET' }, studentJar);
  assert.equal(locsRes.status, 200);
  const hostelLoc = locsRes.body.locations.find(l => l.name.includes('Hostel')) || locsRes.body.locations[0];

  // Step 4: Check CCTV coverage for selected location
  const incidentTime = new Date(Date.now() - 3600 * 1000).toISOString();
  const cctvRes = await apiRequest(`/api/cctv/locate?locationId=${hostelLoc.id}&incidentAt=${encodeURIComponent(incidentTime)}`, { method: 'GET' }, studentJar);
  assert.equal(cctvRes.status, 200);
  assert.ok(cctvRes.body.cameras.length > 0);
  assert.ok(cctvRes.body.disclaimer.includes('does not access real CCTV feeds'));
  const selectedCamId = cctvRes.body.cameras[0].id;

  // Step 5: Submit Case A (Urgent Hostel Ragging)
  const tokenA = `token-caseA-${Date.now()}`;
  const caseARes = await apiRequest('/api/cases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category: 'Ragging',
      incident_at: incidentTime,
      campus_location_id: hostelLoc.id,
      location_detail: 'Hostel Block 3 2nd Floor Corridor Wing B',
      description: 'Hostel confrontation and severe ragging intimidation threats by senior group.',
      suspect_details: 'Three senior students dark hoodies hostel 3',
      urgent: true,
      privacy_mode: 'confidential',
      preferred_language: 'Tamil',
      submission_token: tokenA
    })
  }, studentJar);

  assert.equal(caseARes.status, 201);
  const caseA = caseARes.body.case;
  assert.match(caseA.case_ref, /^SNT-\d{6}-[A-Z2-9]{8}$/);
  assert.equal(caseA.urgent, 1);
  assert.equal(caseA.assigned_level, 'HOD');

  // Step 6: Create CCTV preservation request tied to Case A
  const reqCctvRes = await apiRequest('/api/cctv/requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ case_id: caseA.id, camera_ids: [selectedCamId] })
  }, studentJar);
  assert.equal(reqCctvRes.status, 201);
  assert.ok(reqCctvRes.body.preservationDeadline);

  // Step 7: WhatsApp Notification Flow: Prepared -> Opened -> Awaiting Manual Send
  const prepWaRes = await apiRequest(`/api/whatsapp/${caseA.id}/prepare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level: 'minimal' })
  }, studentJar);
  assert.equal(prepWaRes.status, 200);
  assert.equal(prepWaRes.body.recipient, '917708704229');
  assert.ok(prepWaRes.body.clickToChatUrl.startsWith('https://wa.me/917708704229?text='));

  // Record opened and awaiting_manual_send
  const openWaRes = await apiRequest(`/api/whatsapp/${prepWaRes.body.id}/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: 'opened' })
  }, studentJar);
  assert.equal(openWaRes.status, 200);

  const awaitWaRes = await apiRequest(`/api/whatsapp/${prepWaRes.body.id}/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: 'awaiting_manual_send' })
  }, studentJar);
  assert.equal(awaitWaRes.status, 200);

  // Step 8: HOD Login (Dr. Ramanathan) & Case Review
  const hodJar = new CookieJar();
  const loginHod = await apiRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'hod.cse@campus.edu', password: 'SentinelDemo2026!' })
  }, hodJar);
  assert.equal(loginHod.status, 200);
  assert.equal(loginHod.body.user.role, 'hod');

  // HOD views Case A workspace
  const hodCaseRes = await apiRequest(`/api/cases/${caseA.case_ref}`, { method: 'GET' }, hodJar);
  assert.equal(hodCaseRes.status, 200);
  assert.equal(hodCaseRes.body.case.student_name, 'Priya Sharma');

  // HOD adds confidential internal note
  const addNoteRes = await apiRequest(`/api/cases/${caseA.id}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: 'Preliminary departmental committee inquiry initiated.' })
  }, hodJar);
  assert.equal(addNoteRes.status, 201);

  // Step 9: Submit Case B (Related Report linking to A)
  const caseBTime = new Date(Date.now() - 1800 * 1000).toISOString();
  const tokenB = `token-caseB-${Date.now()}`;
  const caseBRes = await apiRequest('/api/cases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category: 'Ragging',
      incident_at: caseBTime,
      campus_location_id: hostelLoc.id,
      location_detail: 'Hostel Block 3 Common Area',
      description: 'Second intimidation incident by same group of seniors in dark hoodies.',
      suspect_details: 'Three senior students dark hoodies hostel 3',
      urgent: false,
      privacy_mode: 'confidential',
      preferred_language: 'Tamil',
      submission_token: tokenB
    })
  }, studentJar);
  assert.equal(caseBRes.status, 201);
  const caseB = caseBRes.body.case;

  // Step 10: HOD checks Related-Incident Review Queue and finds Case B linking to Case A group!
  const queueRes = await apiRequest('/api/escalation/candidates', { method: 'GET' }, hodJar);
  assert.equal(queueRes.status, 200);
  assert.ok(queueRes.body.candidates.length > 0);
  const cand = queueRes.body.candidates.find(c => c.caseId === caseB.id);
  assert.ok(cand, 'Case B must appear in candidate queue');
  assert.ok(cand.score >= 50, `Score must be >= 50 (was ${cand.score})`);

  // Confirm Link -> Count reaches 2 -> Group Escalates to Dean!
  const confirmRes = await apiRequest(`/api/escalation/candidates/${cand.id}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ review_note: 'Verified recurring pattern in hostel block 3.' })
  }, hodJar);
  assert.equal(confirmRes.status, 200);
  assert.equal(confirmRes.body.finalLevel, 'Dean', 'Two confirmed related incidents must escalate to Dean');
  assert.equal(confirmRes.body.escalated, true);

  // Step 11: Submit Case C (Third Related Report)
  const tokenC = `token-caseC-${Date.now()}`;
  const caseCRes = await apiRequest('/api/cases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category: 'Ragging',
      incident_at: new Date(Date.now() - 900 * 1000).toISOString(),
      campus_location_id: hostelLoc.id,
      location_detail: 'Hostel Block 3 Entrance Porch',
      description: 'Third continuous ragging aggression incident.',
      suspect_details: 'Three senior students dark hoodies hostel 3',
      urgent: false,
      privacy_mode: 'confidential',
      preferred_language: 'Tamil',
      submission_token: tokenC
    })
  }, studentJar);
  assert.equal(caseCRes.status, 201);
  const caseC = caseCRes.body.case;

  // Step 12: Dean Login (Dr. Aruna)
  const deanJar = new CookieJar();
  const loginDean = await apiRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'dean.studentaffairs@campus.edu', password: 'SentinelDemo2026!' })
  }, deanJar);
  assert.equal(loginDean.status, 200);

  // Dean confirms Case C link -> Count reaches 3 -> Group Escalates to Higher Authority!
  const deanQueue = await apiRequest('/api/escalation/candidates', { method: 'GET' }, deanJar);
  const candC = deanQueue.body.candidates.find(c => c.caseId === caseC.id);
  assert.ok(candC);

  const confirmCRes = await apiRequest(`/api/escalation/candidates/${candC.id}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ review_note: 'Persistent safety pattern confirmed across 3 occurrences.' })
  }, deanJar);
  assert.equal(confirmCRes.status, 200);
  assert.equal(confirmCRes.body.finalLevel, 'Higher Authority', 'Three confirmed related incidents must escalate to Higher Authority');

  // Step 13: Higher Authority Login & Analytics
  const higherJar = new CookieJar();
  const loginHigher = await apiRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'director.safety@campus.edu', password: 'SentinelDemo2026!' })
  }, higherJar);
  assert.equal(loginHigher.status, 200);

  const analyticsRes = await apiRequest('/api/analytics', { method: 'GET' }, higherJar);
  assert.equal(analyticsRes.status, 200);
  assert.ok(analyticsRes.body.summary.total >= 3);
  assert.ok(analyticsRes.body.departmentBreakdown.length > 0);

  // Step 14: IDOR and Privilege Enforcement: Student cannot view internal notes
  const studentViewRes = await apiRequest(`/api/cases/${caseA.case_ref}`, { method: 'GET' }, studentJar);
  assert.equal(studentViewRes.status, 200);
  assert.equal(studentViewRes.body.internalNotes, undefined, 'Confidential internal notes must NOT leak to student');
  assert.equal(studentViewRes.body.linkCandidates, undefined, 'Relationship candidates must NOT leak to student');

  // Student cannot access Higher Authority route
  const forbiddenRes = await apiRequest('/api/admin/reset-demo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm: 'RESET_SENTINEL_DEMO' })
  }, studentJar);
  assert.equal(forbiddenRes.status, 403, 'Student must be forbidden from administrative reset');

  // Step 15: Clean Prototype Reset by Higher Authority
  const resetRes = await apiRequest('/api/admin/reset-demo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm: 'RESET_SENTINEL_DEMO' })
  }, higherJar);
  assert.equal(resetRes.status, 200);
  assert.equal(resetRes.body.success, true);
});
