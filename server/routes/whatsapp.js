import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { whatsAppService } from '../notifications/whatsapp.js';
import { db } from '../db/index.js';
import { config } from '../config/index.js';

const router = express.Router();

// Prepare WhatsApp notification payload & click-to-chat URL
router.post('/:caseId/prepare', requireAuth, (req, res, next) => {
  try {
    const user = req.user;
    const caseId = req.params.caseId;
    const { level, audioLinkUrl } = req.body;

    const caseRow = db.prepare('SELECT student_user_id FROM cases WHERE id = ?').get(caseId);
    if (!caseRow) return res.status(404).json({ error: 'Case not found' });

    // Authorization: owner student or authorized authorities
    if (user.role === 'student' && caseRow.student_user_id !== user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const defaultLevel = config.WHATSAPP_INCLUDE_DETAILS ? 'extended' : 'minimal';
    const notification = whatsAppService.prepareNotification(caseId, user.id, {
      level: level || defaultLevel,
      audioLinkUrl
    });

    res.json(notification);
  } catch (err) {
    next(err);
  }
});

// Record honest WhatsApp interaction states
// States: prepared, opened, awaiting_manual_send, audio_share_sheet_opened, audio_link_created
router.post('/:notificationId/state', requireAuth, (req, res, next) => {
  try {
    const user = req.user;
    const notificationId = req.params.notificationId;
    const { state } = req.body;

    const allowedStates = [
      'prepared',
      'opened',
      'awaiting_manual_send',
      'audio_share_sheet_opened',
      'audio_link_created'
    ];

    if (!allowedStates.includes(state)) {
      return res.status(400).json({
        error: 'Invalid state. Honest tracking allows only: prepared, opened, awaiting_manual_send, audio_share_sheet_opened, audio_link_created. Delivery claims are prohibited.'
      });
    }

    const result = whatsAppService.recordStateChange(notificationId, state, user.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
