import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../db/index.js';
import { config } from '../config/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { storageAdapter, detectMimeFromBuffer } from '../storage/index.js';
import { logAudit } from '../utils/audit.js';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.MAX_EVIDENCE_MB * 1024 * 1024 }
});

// Upload evidence attachment
router.post('/cases/:id/evidence', requireAuth, upload.single('file'), async (req, res, next) => {
  try {
    const user = req.user;
    const caseId = req.params.id;

    if (!req.file) {
      return res.status(400).json({ error: 'No evidence file received.' });
    }

    const caseRow = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId);
    if (!caseRow) return res.status(404).json({ error: 'Case not found' });

    if (user.role === 'student' && caseRow.student_user_id !== user.id) {
      return res.status(403).json({ error: 'Unauthorized to attach evidence to this case.' });
    }

    // Check total evidence size for this case
    const currentTotal = db.prepare('SELECT SUM(size_bytes) as total FROM evidence WHERE case_id = ?').get(caseId);
    if ((currentTotal?.total || 0) + req.file.buffer.length > (config.MAX_EVIDENCE_MB * 1024 * 1024)) {
      return res.status(400).json({ error: `Total evidence for this case exceeds ${config.MAX_EVIDENCE_MB} MB limit.` });
    }

    // Validate magic bytes
    const detectedMime = detectMimeFromBuffer(req.file.buffer);
    const mime = detectedMime || req.file.mimetype;

    if (!config.ALLOWED_EVIDENCE_TYPES.includes(mime)) {
      return res.status(400).json({
        error: `File format "${mime}" is not permitted. Only verified image, video, audio, and PDF evidence files are allowed.`
      });
    }

    // Determine evidence kind
    let kind = 'document';
    if (mime.startsWith('image/')) kind = 'image';
    else if (mime.startsWith('video/')) kind = 'video';
    else if (mime.startsWith('audio/')) kind = 'audio';

    // Sanitize filename for display metadata
    const sanitizedFilename = path.basename(req.file.originalname).replace(/[^a-zA-Z0-9._\-]/g, '_');

    // Save privately with UUID key
    const saved = await storageAdapter.saveFile(req.file.buffer, sanitizedFilename);
    const now = new Date().toISOString();

    const result = db.prepare(`
      INSERT INTO evidence (
        case_id, storage_key, original_filename, mime, size_bytes,
        sha256, kind, review_status, uploaded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(
      caseId,
      saved.storageKey,
      sanitizedFilename,
      mime,
      saved.sizeBytes,
      saved.sha256,
      kind,
      now
    );

    logAudit({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'EVIDENCE_UPLOADED',
      entityType: 'evidence',
      entityId: result.lastInsertRowid,
      ip: req.ip,
      details: { caseId, filename: sanitizedFilename, kind, sha256: saved.sha256 }
    });

    res.status(201).json({
      success: true,
      evidenceId: result.lastInsertRowid,
      filename: sanitizedFilename,
      kind,
      sha256: saved.sha256
    });
  } catch (err) {
    next(err);
  }
});

// View/Download evidence file (Authorized, private streaming)
router.get('/:id', requireAuth, (req, res) => {
  const user = req.user;
  const evidenceId = req.params.id;

  const item = db.prepare(`
    SELECT e.*, c.student_user_id, c.department_id, c.case_ref
    FROM evidence e
    JOIN cases c ON e.case_id = c.id
    WHERE e.id = ?
  `).get(evidenceId);

  if (!item) return res.status(404).json({ error: 'Evidence item not found' });

  // Authorization check
  if (user.role === 'student' && item.student_user_id !== user.id) {
    logAudit({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'UNAUTHORIZED_EVIDENCE_ACCESS',
      entityType: 'evidence',
      entityId: evidenceId,
      ip: req.ip
    });
    return res.status(403).json({ error: 'Access denied: You cannot view evidence from other reports.' });
  }

  if (user.role === 'hod' && item.department_id !== user.departmentId) {
    return res.status(403).json({ error: 'Access restricted to departmental scope.' });
  }

  const filePath = storageAdapter.getFilePath(item.storage_key);
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File artifact not found on private storage.' });
  }

  logAudit({
    actorUserId: user.id,
    actorRole: user.role,
    action: 'EVIDENCE_VIEWED',
    entityType: 'evidence',
    entityId: evidenceId,
    ip: req.ip,
    details: { caseRef: item.case_ref, filename: item.original_filename }
  });

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Content-Type', item.mime);
  res.setHeader('Content-Disposition', `inline; filename="${item.original_filename}"`);

  const stat = fs.statSync(filePath);
  const range = req.headers.range;

  if (range && (item.mime.startsWith('video/') || item.mime.startsWith('audio/'))) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
    const chunksize = (end - start) + 1;

    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
    res.setHeader('Content-Length', chunksize);
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.setHeader('Content-Length', stat.size);
    fs.createReadStream(filePath).pipe(res);
  }
});

// Update evidence review status (Authorities only)
router.patch('/:id/review', requireAuth, requireRole(['hod', 'dean', 'higher']), (req, res) => {
  const user = req.user;
  const evidenceId = req.params.id;
  const { status, note } = req.body;

  if (!['pending', 'reviewed', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid review status' });
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE evidence 
    SET review_status = ?, reviewed_by = ?, reviewed_at = ?
    WHERE id = ?
  `).run(status, user.id, now, evidenceId);

  logAudit({
    actorUserId: user.id,
    actorRole: user.role,
    action: 'EVIDENCE_REVIEWED',
    entityType: 'evidence',
    entityId: evidenceId,
    ip: req.ip,
    details: { status, note }
  });

  res.json({ success: true, status });
});

export default router;
