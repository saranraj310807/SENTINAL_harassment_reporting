import express from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// List notifications for current logged in user
router.get('/', requireAuth, (req, res) => {
  const user = req.user;
  const notifications = db.prepare(`
    SELECT * FROM notifications 
    WHERE user_id = ? 
    ORDER BY created_at DESC 
    LIMIT 30
  `).all(user.id);

  const unreadCount = db.prepare(`
    SELECT COUNT(*) as count FROM notifications 
    WHERE user_id = ? AND read_at IS NULL
  `).get(user.id);

  res.json({
    notifications,
    unreadCount: unreadCount?.count || 0
  });
});

// Mark single notification read
router.patch('/:id/read', requireAuth, (req, res) => {
  const user = req.user;
  const now = new Date().toISOString();
  db.prepare('UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ?')
    .run(now, req.params.id, user.id);
  res.json({ success: true });
});

// Mark all notifications read
router.post('/mark-all-read', requireAuth, (req, res) => {
  const user = req.user;
  const now = new Date().toISOString();
  db.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL')
    .run(now, user.id);
  res.json({ success: true });
});

export default router;
