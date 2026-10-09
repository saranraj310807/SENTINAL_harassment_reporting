import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { whatsAppService } from '../notifications/whatsapp.js';
import { db } from '../db/index.js';

const router = express.Router();

// Prepare WhatsApp notification payload & click-to-chat URL
router.post('/:caseId/prepare', requireAuth, (req, res, next) => {
  try {
    const user = req.user;
    const caseId = req.params.caseId;
    const { level } = req.body;

    const caseRow = db.prepare('SELECT student_user_id FROM cases WHERE id = ?').get(caseId);
    if (!caseRow) return res.status(404).json({ error: 'Case not found' });

    // Authorization: owner student or authorized authorities
    if (user.role === 'student' && caseRow.student_user_id !== user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const notification = whatsAppService.prepareNotification(caseId, user.id, {
      level: level || (user.role === 'student' ? 'minimal' : 'extended')
    });

    res.json(notification);
  } catch (err) {
    next(err);
  }
});

// Record honest WhatsApp interaction states (opened, awaiting_manual_send)
router.post('/:notificationId/state', requireAuth, (req, res, next) => {
  try {
    const user = req.user;
    const notificationId = req.params.notificationId;
    const { state } = req.body;

    if (!['opened', 'awaiting_manual_send'].includes(state)) {
      return res.status(400).json({
        error: 'Invalid state. Honest tracking only allows "opened" and "awaiting_manual_send". Fake delivery confirmations are prohibited.'
      });
    }

    const result = whatsAppService.recordStateChange(notificationId, state, user.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
