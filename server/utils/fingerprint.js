import crypto from 'node:crypto';
import { db } from '../db/index.js';

export function roundDateToMinutes(dateInput, minutes = 10) {
  const date = new Date(dateInput);
  const ms = 1000 * 60 * minutes;
  return new Date(Math.round(date.getTime() / ms) * ms).toISOString();
}

export function normalizeText(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function computeFingerprint({
  studentUserId,
  category,
  campusLocationId,
  incidentAt,
  description = ''
}) {
  const roundedIncident = roundDateToMinutes(incidentAt, 10);
  const normalizedDesc = normalizeText(description).substring(0, 150); // first 150 chars normalized

  const rawKey = [
    studentUserId,
    category,
    campusLocationId || 'none',
    roundedIncident,
    normalizedDesc
  ].join(':::');

  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

export function checkDuplicateCase({
  studentUserId,
  submissionToken,
  fingerprint,
  windowMinutes = 10
}) {
  // 1. Check submission token idempotency
  if (submissionToken) {
    const byToken = db.prepare('SELECT * FROM cases WHERE submission_token = ?').get(submissionToken);
    if (byToken) {
      return { isDuplicate: true, type: 'token', existingCase: byToken };
    }
  }

  // 2. Check fingerprint within 10-minute window
  const tenMinutesAgo = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  const byFingerprint = db.prepare(`
    SELECT * FROM cases 
    WHERE student_user_id = ? 
      AND fingerprint = ? 
      AND created_at >= ?
    ORDER BY created_at DESC 
    LIMIT 1
  `).get(studentUserId, fingerprint, tenMinutesAgo);

  if (byFingerprint) {
    return { isDuplicate: true, type: 'fingerprint', existingCase: byFingerprint };
  }

  return { isDuplicate: false };
}
