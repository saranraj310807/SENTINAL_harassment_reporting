import express from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { db } from '../db/index.js';
import { config } from '../config/index.js';
import { storageAdapter } from '../storage/index.js';
import { formatCampusDateTime } from '../notifications/whatsapp.js';
import { logAudit } from '../utils/audit.js';

const router = express.Router();

// Rate limiting for expiring links: 30 requests per 15 minutes per IP
const listenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many audio playback requests from this IP. Please try again later.'
});

router.use(listenLimiter);

// Common security headers for all /listen routes
router.use((req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Content-Security-Policy', "default-src 'self'; media-src 'self' blob:; style-src 'unsafe-inline'; script-src 'self' 'unsafe-inline'");
  next();
});

function renderHtmlResponse(title, contentHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>${title} - SENTINEL</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #070B1A;
      color: #F8FAFC;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .player-card {
      background: #0E1530;
      border: 1px solid #1E2958;
      border-radius: 12px;
      max-width: 480px;
      width: 100%;
      padding: 28px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
    }
    .brand-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 20px;
      padding-bottom: 16px;
      border-bottom: 1px solid #1E2958;
    }
    .brand-shield {
      background: #14B8A6;
      color: #070B1A;
      font-weight: 800;
      font-size: 0.8125rem;
      padding: 4px 8px;
      border-radius: 6px;
      letter-spacing: 0.05em;
    }
    .brand-title {
      font-size: 0.9375rem;
      font-weight: 600;
      color: #E2E8F0;
    }
    .warning-box {
      background: rgba(245, 158, 11, 0.1);
      border: 1px solid rgba(245, 158, 11, 0.3);
      border-radius: 8px;
      padding: 12px;
      font-size: 0.8125rem;
      color: #FBBF24;
      line-height: 1.5;
      margin-bottom: 20px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 20px;
      background: #141C3D;
      padding: 12px;
      border-radius: 8px;
    }
    .info-item {
      font-size: 0.75rem;
    }
    .info-label {
      color: #94A3B8;
      margin-bottom: 2px;
    }
    .info-val {
      color: #FFFFFF;
      font-weight: 600;
    }
    audio {
      width: 100%;
      height: 44px;
      border-radius: 8px;
      outline: none;
      margin-bottom: 16px;
    }
    .privacy-notice {
      font-size: 0.6875rem;
      color: #64748B;
      text-align: center;
      line-height: 1.4;
    }
    .error-card {
      text-align: center;
      padding: 24px 0;
    }
    .error-icon {
      font-size: 2.5rem;
      margin-bottom: 12px;
    }
    .error-title {
      font-size: 1.125rem;
      font-weight: 600;
      color: #EF4444;
      margin-bottom: 8px;
    }
    .error-desc {
      font-size: 0.8125rem;
      color: #94A3B8;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="player-card">
    <div class="brand-header">
      <div class="brand-shield">SENTINEL</div>
      <div class="brand-title">Confidential Audio Player</div>
    </div>
    ${contentHtml}
  </div>
</body>
</html>`;
}

// Minimal audio player view: strictly NO case details
router.get('/:token', (req, res) => {
  const token = req.params.token;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    return res.status(404).send(renderHtmlResponse('Invalid Link', `
      <div class="error-card">
        <div class="error-icon">✕</div>
        <div class="error-title">Invalid Audio Link</div>
        <div class="error-desc">This playback link is malformed or invalid. Please request a new link from campus authorities.</div>
      </div>
    `));
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const linkRow = db.prepare('SELECT * FROM audio_links WHERE token_hash = ?').get(tokenHash);

  if (!linkRow) {
    return res.status(404).send(renderHtmlResponse('Link Not Found', `
      <div class="error-card">
        <div class="error-icon">✕</div>
        <div class="error-title">Audio Link Not Found</div>
        <div class="error-desc">This single-purpose playback link does not exist or has been permanently removed.</div>
      </div>
    `));
  }

  // Check if revoked
  if (linkRow.revoked_at) {
    return res.status(410).send(renderHtmlResponse('Link Revoked', `
      <div class="error-card">
        <div class="error-icon">⊘</div>
        <div class="error-title">Playback Link Revoked</div>
        <div class="error-desc">This audio playback link was revoked by campus safety authorities and is no longer accessible.</div>
      </div>
    `));
  }

  // Check if expired
  const now = new Date();
  const expiresAt = new Date(linkRow.expires_at);
  if (now > expiresAt) {
    return res.status(410).send(renderHtmlResponse('Link Expired', `
      <div class="error-card">
        <div class="error-icon">⌛</div>
        <div class="error-title">Playback Link Expired</div>
        <div class="error-desc">This temporary link expired after 24 hours. For safety and privacy, recordings cannot be accessed after expiration.</div>
      </div>
    `));
  }

  // Check if play limit reached
  if (linkRow.plays_count >= linkRow.max_plays) {
    return res.status(410).send(renderHtmlResponse('Limit Reached', `
      <div class="error-card">
        <div class="error-icon">⏹</div>
        <div class="error-title">Play Limit Reached</div>
        <div class="error-desc">This link has reached its maximum playback limit (${linkRow.max_plays} plays) and is now closed.</div>
      </div>
    `));
  }

  const remainingPlays = linkRow.max_plays - linkRow.plays_count;
  const expiresFormatted = formatCampusDateTime(linkRow.expires_at);

  const contentHtml = `
    <div class="warning-box">
      <strong>Confidential Audio Notice:</strong><br>
      Anyone holding this temporary link can listen to this recording until it expires or reaches the play limit. Do not forward or share outside authorized review channels.
    </div>

    <div class="info-grid">
      <div class="info-item">
        <div class="info-label">Link Status</div>
        <div class="info-val" style="color: #34D399;">Active (Verified)</div>
      </div>
      <div class="info-item">
        <div class="info-label">Plays Remaining</div>
        <div class="info-val">${remainingPlays} of ${linkRow.max_plays} plays</div>
      </div>
      <div class="info-item" style="grid-column: span 2;">
        <div class="info-label">Link Expires</div>
        <div class="info-val">${expiresFormatted}</div>
      </div>
    </div>

    <audio controls preload="metadata" src="/listen/${token}/stream"></audio>

    <div class="privacy-notice">
      Zero-knowledge player: Case references, student identities, and investigation notes are strictly isolated and not accessible via this link. Every playback is logged.
    </div>
  `;

  res.send(renderHtmlResponse('Audio Playback', contentHtml));
});

// Stream audio for the expiring link with HTTP Range support
router.get('/:token/stream', (req, res) => {
  const token = req.params.token;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    return res.status(404).send('Invalid token');
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const linkRow = db.prepare('SELECT * FROM audio_links WHERE token_hash = ?').get(tokenHash);

  if (!linkRow) return res.status(404).send('Link not found');
  if (linkRow.revoked_at) return res.status(410).send('Link revoked');
  if (new Date() > new Date(linkRow.expires_at)) return res.status(410).send('Link expired');
  if (linkRow.plays_count >= linkRow.max_plays) return res.status(410).send('Max plays reached');

  // Look for share copy first, then original audio
  const shareCopy = db.prepare('SELECT * FROM audio_share_copies WHERE case_id = ? ORDER BY id DESC LIMIT 1').get(linkRow.case_id);
  const origAudio = db.prepare('SELECT * FROM audio_complaints WHERE case_id = ? ORDER BY id DESC LIMIT 1').get(linkRow.case_id);

  let filePath = null;
  let mimeType = 'audio/mp4';

  if (shareCopy) {
    const p = storageAdapter.getFilePath(shareCopy.storage_key);
    if (p && fs.existsSync(p)) {
      filePath = p;
      mimeType = shareCopy.mime || 'audio/mp4';
    }
  }

  if (!filePath && origAudio) {
    const p = storageAdapter.getFilePath(origAudio.storage_key);
    if (p && fs.existsSync(p)) {
      filePath = p;
      mimeType = origAudio.original_mime || 'audio/webm';
    }
  }

  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).send('Audio media file not found');
  }

  const range = req.headers.range;
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;

  // Count a play on initial request or when range starts at 0
  const isInitialPlay = !range || range.startsWith('bytes=0-');
  if (isInitialPlay) {
    db.prepare('UPDATE audio_links SET plays_count = plays_count + 1 WHERE id = ?').run(linkRow.id);
    logAudit({
      actorUserId: null,
      actorRole: 'external_recipient',
      action: 'AUDIO_LINK_PLAYBACK',
      entityType: 'audio_link',
      entityId: linkRow.id,
      ip: req.ip,
      details: {
        caseId: linkRow.case_id,
        playsCount: linkRow.plays_count + 1,
        maxPlays: linkRow.max_plays
      }
    });
  }

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Content-Disposition', 'inline; filename="sentinel-audio"');
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
});

export default router;
