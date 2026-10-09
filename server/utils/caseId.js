import crypto from 'node:crypto';
import { db } from '../db/index.js';

const UNAMBIGUOUS_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRandomString(length = 8) {
  let result = '';
  const charLen = UNAMBIGUOUS_CHARS.length;
  for (let i = 0; i < length; i++) {
    const randIndex = crypto.randomInt(0, charLen);
    result += UNAMBIGUOUS_CHARS[randIndex];
  }
  return result;
}

export function formatCaseRefDate(date = new Date()) {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

export function generateUniqueCaseRef(date = new Date()) {
  const dateStr = formatCaseRefDate(date);
  const maxAttempts = 10;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const suffix = generateRandomString(8);
    const candidateRef = `SNT-${dateStr}-${suffix}`;
    
    // Check collision
    const existing = db.prepare('SELECT id FROM cases WHERE case_ref = ?').get(candidateRef);
    if (!existing) {
      return candidateRef;
    }
  }

  throw new Error('Failed to generate unique case reference after maximum attempts');
}
