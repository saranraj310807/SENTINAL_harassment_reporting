import express from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { seedDatabase } from '../seed/seed.js';
import { logAudit } from '../utils/audit.js';

const router = express.Router();

// Reset demo data to clean prototype state (Higher Authority only)
router.post('/reset-demo', requireAuth, requireRole(['higher']), async (req, res, next) => {
  try {
    const user = req.user;
    const { confirm } = req.body;

    if (confirm !== 'RESET_SENTINEL_DEMO') {
      return res.status(400).json({
        error: 'Confirmation string "RESET_SENTINEL_DEMO" is required to reset demo prototype data.'
      });
    }

    await seedDatabase(true);

    logAudit({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'DEMO_DATA_RESET',
      entityType: 'database',
      entityId: 'all',
      ip: req.ip
    });

    res.json({
      success: true,
      message: 'SENTINEL demonstration prototype data has been cleanly restored to initial baseline.'
    });
  } catch (err) {
    next(err);
  }
});

export default router;
