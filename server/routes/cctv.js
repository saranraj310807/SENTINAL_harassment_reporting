import express from 'express';
import { db } from '../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { locateMatchingCameras } from '../utils/cctv.js';
import { cctvRequestSchema } from '../utils/validation.js';
import { logAudit } from '../utils/audit.js';

const router = express.Router();

const CCTV_DISCLAIMER = 'This tool does not access real CCTV feeds. Matching cameras are a coverage lookup only and do not identify suspects or establish wrongdoing.';

// Locate matching fictional cameras for a given location and timestamp
router.get('/locate', requireAuth, (req, res) => {
  const { locationId, incidentAt } = req.query;

  if (!locationId || !incidentAt) {
    return res.status(400).json({ error: 'Both locationId and incidentAt query parameters are required' });
  }

  const cameras = locateMatchingCameras(locationId, incidentAt);

  res.json({
    disclaimer: CCTV_DISCLAIMER,
    cameras
  });
});

// List all campus cameras (for directory or standalone locator)
router.get('/cameras', requireAuth, (req, res) => {
  const cameras = db.prepare(`
    SELECT c.*, l.name as location_name, l.zone, l.building
    FROM cameras c
    LEFT JOIN campus_locations l ON c.location_id = l.id
    ORDER BY l.zone, c.camera_code
  `).all();

  const formatted = cameras.map(cam => ({
    id: cam.id,
    cameraCode: cam.camera_code,
    label: cam.label,
    locationName: cam.location_name,
    building: cam.building,
    zone: cam.zone,
    coverageDescription: cam.coverage_description,
    operatingHours: `${cam.operating_from} - ${cam.operating_to}`,
    retentionHours: cam.retention_hours,
    verificationStatus: cam.verification_status,
    isFictional: Boolean(cam.is_fictional)
  }));

  res.json({
    disclaimer: CCTV_DISCLAIMER,
    cameras: formatted
  });
});

// Create a preservation and footage-review request tied to a case
router.post('/requests', requireAuth, (req, res, next) => {
  try {
    const user = req.user;
    const data = cctvRequestSchema.parse(req.body);

    const caseRow = db.prepare('SELECT * FROM cases WHERE id = ?').get(data.case_id);
    if (!caseRow) return res.status(404).json({ error: 'Case not found' });

    if (user.role === 'student' && caseRow.student_user_id !== user.id) {
      return res.status(403).json({ error: 'Unauthorized to request CCTV review for this case.' });
    }

    // Calculate nearest preservation deadline among selected cameras
    let earliestDeadline = new Date(new Date(caseRow.incident_at).getTime() + 72 * 3600 * 1000); // default 72h
    for (const camId of data.camera_ids) {
      const cam = db.prepare('SELECT retention_hours FROM cameras WHERE id = ?').get(camId);
      if (cam) {
        const camDeadline = new Date(new Date(caseRow.incident_at).getTime() + cam.retention_hours * 3600 * 1000);
        if (camDeadline < earliestDeadline) {
          earliestDeadline = camDeadline;
        }
      }
    }

    const now = new Date().toISOString();
    const result = db.prepare(`
      INSERT INTO cctv_requests (
        case_id, camera_ids, requested_by, requested_at,
        preservation_deadline, status, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'requested', ?)
    `).run(
      data.case_id,
      JSON.stringify(data.camera_ids),
      user.id,
      now,
      earliestDeadline.toISOString(),
      now
    );

    logAudit({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'CCTV_PRESERVATION_REQUESTED',
      entityType: 'cctv_request',
      entityId: result.lastInsertRowid,
      ip: req.ip,
      details: { caseId: data.case_id, cameraIds: data.camera_ids, deadline: earliestDeadline.toISOString() }
    });

    res.status(201).json({
      success: true,
      requestId: result.lastInsertRowid,
      preservationDeadline: earliestDeadline.toISOString(),
      disclaimer: CCTV_DISCLAIMER
    });
  } catch (err) {
    next(err);
  }
});

// Update CCTV request status and outcome (Authorities only)
router.patch('/requests/:id', requireAuth, requireRole(['hod', 'dean', 'higher']), (req, res) => {
  const user = req.user;
  const requestId = req.params.id;
  const { status, outcomeNote } = req.body;

  const validStatuses = [
    'requested',
    'preservation_confirmed',
    'under_review',
    'reviewed',
    'footage_unavailable',
    'closed'
  ];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid CCTV request status' });
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE cctv_requests 
    SET status = ?, outcome_note = ?, updated_by = ?, updated_at = ?
    WHERE id = ?
  `).run(status, outcomeNote || null, user.id, now, requestId);

  logAudit({
    actorUserId: user.id,
    actorRole: user.role,
    action: 'CCTV_REQUEST_UPDATED',
    entityType: 'cctv_request',
    entityId: requestId,
    ip: req.ip,
    details: { status, outcomeNote }
  });

  res.json({ success: true, status });
});

export default router;
