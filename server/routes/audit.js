import express from 'express';
import { db } from '../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.get('/', requireAuth, requireRole(['dean', 'higher']), (req, res) => {
  const { limit = '50', offset = '0', action, entityType } = req.query;

  let query = `
    SELECT a.*, u.full_name as actor_name
    FROM audit_log a
    LEFT JOIN users u ON a.actor_user_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (action) {
    query += ' AND a.action = ?';
    params.push(action);
  }

  if (entityType) {
    query += ' AND a.entity_type = ?';
    params.push(entityType);
  }

  query += ' ORDER BY a.id DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit, 10), parseInt(offset, 10));

  const logs = db.prepare(query).all(...params);

  const formatted = logs.map(l => {
    let details = {};
    try { details = JSON.parse(l.details); } catch {}
    return {
      id: l.id,
      ts: l.ts,
      actorUserId: l.actor_user_id,
      actorName: l.actor_name || 'System / Automated',
      actorRole: l.actor_role,
      action: l.action,
      entityType: l.entity_type,
      entityId: l.entity_id,
      ipHash: l.ip_hash,
      details
    };
  });

  const total = db.prepare('SELECT COUNT(*) as count FROM audit_log').get();

  res.json({
    logs: formatted,
    total: total?.count || 0
  });
});

export default router;
