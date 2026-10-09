import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import { db } from '../db/index.js';
import { config } from '../config/index.js';
import { requireAuth } from '../middleware/auth.js';
import { storageAdapter, detectMimeFromBuffer } from '../storage/index.js';
import { audioMetadataSchema } from '../utils/validation.js';
import { logAudit } from '../utils/audit.js';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.MAX_AUDIO_MB * 1024 * 1024 }
});

// Upload/Record audio complaint for a case
router.post('/cases/:id/audio', requireAuth, upload.single('audio'), async (req, res, next) => {
  try {
    const user = req.user;
    const caseId = req.params.id;

    if (!req.file) {
      return res.status(400).json({ error: 'No audio file received.' });
    }

    const caseRow = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId);
    if (!caseRow) return res.status(404).json({ error: 'Case not found' });

    // Only owner student can attach audio during or after filing
    if (user.role === 'student' && caseRow.student_user_id !== user.id) {
      return res.status(403).json({ error: 'Unauthorized to attach audio to this case.' });
    }

    const metadata = audioMetadataSchema.parse(req.body);

    // Magic bytes verification
    const detectedMime = detectMimeFromBuffer(req.file.buffer);
    const validAudioMimes = ['audio/webm', 'video/webm', 'audio/mp4', 'video/mp4', 'audio/mpeg', 'audio/wav', 'audio/ogg'];
    
    // Fallback: check declared mime if generic or webm container
    const effectiveMime = detectedMime || req.file.mimetype;
    if (!validAudioMimes.includes(effectiveMime) && !effectiveMime.startsWith('audio/')) {
      return res.status(400).json({
        error: `Invalid audio format (${effectiveMime}). Disguised or unsupported media files are rejected.`
      });
    }

    // Save to private disk storage
    const saved = await storageAdapter.saveFile(req.file.buffer, req.file.originalname || 'recording.webm');
    const now = new Date().toISOString();

    // Insert into audio_complaints table (Strict: Zero text/transcript columns)
    const result = db.prepare(`
      INSERT INTO audio_complaints (
        case_id, storage_key, original_mime, size_bytes, duration_seconds,
        preferred_language, recorded_or_uploaded, sha256, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      caseId,
      saved.storageKey,
      effectiveMime,
      saved.sizeBytes,
      metadata.duration_seconds || 0,
      metadata.preferred_language,
      metadata.recorded_or_uploaded,
      saved.sha256,
      now
    );

    // Update case preferred_language
    db.prepare('UPDATE cases SET preferred_language = ?, updated_at = ? WHERE id = ?')
      .run(metadata.preferred_language, now, caseId);

    logAudit({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'AUDIO_ATTACHED',
      entityType: 'audio_complaint',
      entityId: result.lastInsertRowid,
      ip: req.ip,
      details: {
        caseId,
        sha256: saved.sha256,
        sizeBytes: saved.sizeBytes,
        language: metadata.preferred_language
      }
    });

    res.status(201).json({
      success: true,
      audioId: result.lastInsertRowid,
      sha256: saved.sha256,
      sizeBytes: saved.sizeBytes
    });
  } catch (err) {
    next(err);
  }
});

// Authorized streaming endpoint with HTTP Range support
router.get('/cases/:id/audio', requireAuth, (req, res) => {
  const user = req.user;
  const caseId = req.params.id;

  const caseRow = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId);
  if (!caseRow) return res.status(404).json({ error: 'Case not found' });

  // Authorization check
  if (user.role === 'student' && caseRow.student_user_id !== user.id) {
    logAudit({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'UNAUTHORIZED_AUDIO_ACCESS',
      entityType: 'case_audio',
      entityId: caseId,
      ip: req.ip
    });
    return res.status(403).json({ error: 'Access denied: You cannot listen to audio from other complaints.' });
  }

  if (user.role === 'hod' && caseRow.department_id !== user.departmentId) {
    return res.status(403).json({ error: 'Access denied: Department scope mismatch.' });
  }

  const audio = db.prepare('SELECT * FROM audio_complaints WHERE case_id = ? ORDER BY id DESC LIMIT 1').get(caseId);
  if (!audio) {
    return res.status(404).json({ error: 'No audio recording associated with this case.' });
  }

  const filePath = storageAdapter.getFilePath(audio.storage_key);
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Audio file storage artifact not found.' });
  }

  // Audit playback
  logAudit({
    actorUserId: user.id,
    actorRole: user.role,
    action: 'AUDIO_STREAM_PLAYBACK',
    entityType: 'audio_complaint',
    entityId: audio.id,
    ip: req.ip,
    details: { caseId: caseRow.id, sha256: audio.sha256 }
  });

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  // Security headers: No caching of private audio
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Content-Disposition', 'inline; filename="sentinel-audio.webm"');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', audio.original_mime || 'audio/webm');

  if (range) {
    // Parse Range header e.g. "bytes=0-1024"
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (start >= fileSize || end >= fileSize) {
      res.setHeader('Content-Range', `bytes */${fileSize}`);
      return res.status(416).send('Requested range not satisfiable');
    }

    const chunksize = (end - start) + 1;
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    res.setHeader('Content-Length', chunksize);

    const stream = fs.createReadStream(filePath, { start, end });
    stream.pipe(res);
  } else {
    res.status(200);
    res.setHeader('Content-Length', fileSize);
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  }
});

export default router;
