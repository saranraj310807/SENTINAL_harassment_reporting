import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { config } from '../config/index.js';
import { requireAuth } from '../middleware/auth.js';
import { storageAdapter, detectMimeFromBuffer } from '../storage/index.js';
import { audioMetadataSchema } from '../utils/validation.js';
import { logAudit } from '../utils/audit.js';
import { ensureShareCopy } from '../storage/audioConverter.js';
import { isPublicHttpsUrl } from '../notifications/whatsapp.js';

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

    // Save to private disk storage (original untouched)
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

    // Trigger share copy generation with ffmpeg (format conversion only, original untouched)
    try {
      await ensureShareCopy(result.lastInsertRowid);
    } catch (e) {
      console.warn('[AUDIO SHARE COPY] Background generation notice:', e.message);
    }

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
// Supports ?share=1 to stream the WhatsApp-optimized .m4a format, or ?download=1 to download
router.get('/cases/:id/audio', requireAuth, async (req, res, next) => {
  try {
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

    let filePath = storageAdapter.getFilePath(audio.storage_key);
    let mimeType = audio.original_mime || 'audio/webm';
    let fileExtension = mimeType.includes('mp4') ? 'm4a' : (mimeType.includes('mpeg') ? 'mp3' : 'webm');

    // If share format is requested, serve derived share copy if available
    if (req.query.share === '1' || req.query.format === 'share') {
      const shareCopy = await ensureShareCopy(audio.id);
      if (shareCopy) {
        const sharePath = storageAdapter.getFilePath(shareCopy.storage_key);
        if (sharePath && fs.existsSync(sharePath)) {
          filePath = sharePath;
          mimeType = shareCopy.mime || 'audio/mp4';
          fileExtension = 'm4a';
        }
      }
    }

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
      details: { caseId: caseRow.id, sha256: audio.sha256, shareFormat: req.query.share === '1' }
    });

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;
    const cleanFilename = `SENTINEL-${caseRow.case_ref}.${fileExtension}`;
    const dispositionType = req.query.download === '1' ? 'attachment' : 'inline';

    // Security headers: No caching of private audio
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Content-Disposition', `${dispositionType}; filename="${cleanFilename}"`);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', mimeType);

    if (range) {
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
  } catch (err) {
    next(err);
  }
});

// Generate an expiring single-purpose 256-bit audio playback link
router.post('/cases/:id/audio-link', requireAuth, (req, res, next) => {
  try {
    const user = req.user;
    const caseId = req.params.id;

    if (!config.AUDIO_LINK_ENABLED) {
      return res.status(400).json({ error: 'Expiring audio links are currently disabled by policy.' });
    }

    const caseRow = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId);
    if (!caseRow) return res.status(404).json({ error: 'Case not found' });

    // Authorization
    if (user.role === 'student' && caseRow.student_user_id !== user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (user.role === 'hod' && caseRow.department_id !== user.departmentId) {
      return res.status(403).json({ error: 'Access denied: Department mismatch' });
    }

    const audio = db.prepare('SELECT * FROM audio_complaints WHERE case_id = ? ORDER BY id DESC LIMIT 1').get(caseId);
    if (!audio) {
      return res.status(400).json({ error: 'No audio recording associated with this case to generate a link for.' });
    }

    // Generate 256-bit secure random token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const ttlHours = config.AUDIO_LINK_TTL_HOURS || 24;
    const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();
    const maxPlays = config.AUDIO_LINK_MAX_PLAYS || 5;
    const now = new Date().toISOString();

    const insertResult = db.prepare(`
      INSERT INTO audio_links (
        case_id, token_hash, expires_at, max_plays, plays_count, created_at, created_by
      ) VALUES (?, ?, ?, ?, 0, ?, ?)
    `).run(caseId, tokenHash, expiresAt, maxPlays, now, user.id);

    // Update whatsapp notification state if exists
    try {
      const waRow = db.prepare('SELECT id FROM whatsapp_notifications WHERE case_id = ? ORDER BY id DESC LIMIT 1').get(caseId);
      if (waRow) {
        db.prepare('UPDATE whatsapp_notifications SET state = ? WHERE id = ?').run('audio_link_created', waRow.id);
      }
    } catch {}

    logAudit({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'AUDIO_LINK_CREATED',
      entityType: 'audio_link',
      entityId: insertResult.lastInsertRowid,
      details: { caseId, ttlHours, maxPlays, expiresAt }
    });

    const isPublic = isPublicHttpsUrl(config.APP_BASE_URL);
    const listenUrl = `${config.APP_BASE_URL}/listen/${rawToken}`;

    res.status(201).json({
      id: insertResult.lastInsertRowid,
      rawToken,
      listenUrl,
      isPublicHttps: isPublic,
      expiresAt,
      maxPlays,
      ttlHours,
      warning: isPublic ? null : 'APP_BASE_URL is not a public HTTPS URL. Audio link is omitted from WhatsApp messages to prevent unroutable links.'
    });
  } catch (err) {
    next(err);
  }
});

// List active/historical audio links for this case
router.get('/cases/:id/audio-links', requireAuth, (req, res, next) => {
  try {
    const user = req.user;
    const caseId = req.params.id;

    const caseRow = db.prepare('SELECT student_user_id, department_id FROM cases WHERE id = ?').get(caseId);
    if (!caseRow) return res.status(404).json({ error: 'Case not found' });

    if (user.role === 'student' && caseRow.student_user_id !== user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (user.role === 'hod' && caseRow.department_id !== user.departmentId) {
      return res.status(403).json({ error: 'Access denied: Department mismatch' });
    }

    const links = db.prepare(`
      SELECT id, case_id, expires_at, max_plays, plays_count, revoked_at, created_at
      FROM audio_links
      WHERE case_id = ?
      ORDER BY id DESC
    `).all(caseId);

    res.json(links);
  } catch (err) {
    next(err);
  }
});

// Revoke an audio link immediately
router.post('/cases/:id/audio-links/:linkId/revoke', requireAuth, (req, res, next) => {
  try {
    const user = req.user;
    const { id: caseId, linkId } = req.params;

    const caseRow = db.prepare('SELECT student_user_id, department_id FROM cases WHERE id = ?').get(caseId);
    if (!caseRow) return res.status(404).json({ error: 'Case not found' });

    if (user.role === 'student' && caseRow.student_user_id !== user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (user.role === 'hod' && caseRow.department_id !== user.departmentId) {
      return res.status(403).json({ error: 'Access denied: Department mismatch' });
    }

    const link = db.prepare('SELECT * FROM audio_links WHERE id = ? AND case_id = ?').get(linkId, caseId);
    if (!link) return res.status(404).json({ error: 'Audio link not found' });

    const now = new Date().toISOString();
    db.prepare('UPDATE audio_links SET revoked_at = ? WHERE id = ?').run(now, linkId);

    logAudit({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'AUDIO_LINK_REVOKED',
      entityType: 'audio_link',
      entityId: linkId,
      details: { caseId }
    });

    res.json({ success: true, message: 'Audio link revoked immediately.' });
  } catch (err) {
    next(err);
  }
});

export default router;
