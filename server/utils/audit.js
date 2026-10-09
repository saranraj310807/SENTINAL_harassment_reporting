import crypto from 'node:crypto';
import { db } from '../db/index.js';

export function hashIp(ip) {
  if (!ip) return 'unknown';
  return crypto.createHash('sha256').update(ip + '-sentinel-salt').digest('hex').substring(0, 16);
}

export function logAudit({
  actorUserId = null,
  actorRole = 'system',
  action,
  entityType,
  entityId = null,
  ip = null,
  details = {}
}) {
  try {
    const ts = new Date().toISOString();
    const ipHash = hashIp(ip);
    
    // Sanitize details: strictly remove any passwords, session tokens, full complaint text or audio data
    const sanitizedDetails = { ...details };
    delete sanitizedDetails.password;
    delete sanitizedDetails.password_hash;
    delete sanitizedDetails.sessionToken;
    delete sanitizedDetails.audioBuffer;
    delete sanitizedDetails.description; // do not store raw complaint narrative in audit logs

    db.prepare(`
      INSERT INTO audit_log (ts, actor_user_id, actor_role, action, entity_type, entity_id, ip_hash, details)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      ts,
      actorUserId,
      actorRole,
      action,
      entityType,
      entityId ? String(entityId) : null,
      ipHash,
      JSON.stringify(sanitizedDetails)
    );

    // Structured console log (never leaking sensitive payload)
    console.log(JSON.stringify({
      level: 'info',
      ts,
      type: 'AUDIT',
      action,
      entityType,
      entityId,
      actorUserId,
      actorRole
    }));
  } catch (err) {
    console.error('[AUDIT_ERROR] Failed to write audit log:', err.message);
  }
}
