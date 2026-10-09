import crypto from 'node:crypto';
import { config } from '../config/index.js';
import { db } from '../db/index.js';
import { logAudit } from '../utils/audit.js';

export function normalizeWhatsAppNumber(rawNumber, defaultCountryCode = '91', countryConfirmed = true) {
  if (!rawNumber) {
    return { valid: false, error: 'Recipient phone number is missing' };
  }

  // Strip spaces, dashes, brackets, leading + or 00
  let cleaned = String(rawNumber).replace(/[\s\-\(\)]/g, '');
  if (cleaned.startsWith('+')) cleaned = cleaned.substring(1);
  if (cleaned.startsWith('00')) cleaned = cleaned.substring(2);

  // International format: 11-15 digits
  if (/^\d{11,15}$/.test(cleaned)) {
    return { valid: true, e164Digits: cleaned };
  }

  // 10-digit mobile starting with 6-9 (Indian standard)
  if (/^[6-9]\d{9}$/.test(cleaned)) {
    if (countryConfirmed) {
      const formatted = `${defaultCountryCode}${cleaned}`;
      return { valid: true, e164Digits: formatted };
    }
    return {
      valid: false,
      error: 'Country code confirmation required for 10-digit number. Set WHATSAPP_COUNTRY_CONFIRMED=true.'
    };
  }

  return {
    valid: false,
    error: `Invalid phone format (${rawNumber}). Expected 10-digit mobile or 11-15 digit international E.164 number.`
  };
}

export function formatCampusDateTime(isoString, timezone = config.CAMPUS_TIMEZONE) {
  if (!isoString) return 'N/A';
  try {
    const d = new Date(isoString);
    const dateFormatted = d.toLocaleDateString('en-GB', {
      timeZone: timezone,
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
    const timeFormatted = d.toLocaleTimeString('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    return `${dateFormatted} ${timeFormatted} (${timezone})`;
  } catch {
    return `${isoString} (UTC)`;
  }
}

/**
 * Validates if the configured URL is a public HTTPS domain.
 * Localhost, 127.0.0.1, or non-HTTPS URLs are rejected from WhatsApp notifications.
 */
export function isPublicHttpsUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      hostname.endsWith('.local')
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function prepareWhatsAppMessage(caseData, options = {}) {
  // Default to EXTENDED level for demo if WHATSAPP_INCLUDE_DETAILS is enabled
  const level = options.level || (config.WHATSAPP_INCLUDE_DETAILS ? 'extended' : 'minimal');
  const incidentTimeStr = formatCampusDateTime(caseData.incident_at);
  const submittedTimeStr = formatCampusDateTime(caseData.submitted_at || caseData.created_at);

  // Clean plain text, UTF-8. Zero emojis and zero special symbols.
  const lines = [
    'SENTINEL CAMPUS SAFETY ALERT',
    '----------------------------------------',
    `Case ID: ${caseData.case_ref}`,
    `Incident Date/Time: ${incidentTimeStr}`,
    `Submission Date/Time: ${submittedTimeStr}`,
    `Campus Location: ${caseData.location_name || 'Designated Campus Area'} (${caseData.location_detail || 'Campus'})`,
    `Urgency: ${caseData.urgent ? 'URGENT - IMMEDIATE ATTENTION' : 'Standard Priority'}`,
    `Assigned Authority: ${caseData.assigned_level || 'HOD'}`
  ];

  if (level === 'extended') {
    lines.push('----------------------------------------');
    lines.push(`Category: ${caseData.category}`);
    if (caseData.student_name && caseData.privacy_mode !== 'anonymous_to_reviewers_where_permitted') {
      lines.push(`Student: ${caseData.student_name}`);
      if (caseData.sif_number) lines.push(`SIF Number: ${caseData.sif_number}`);
      if (caseData.department_name) lines.push(`Department: ${caseData.department_name}`);
      if (caseData.programme) lines.push(`Programme: ${caseData.programme}`);
      const yrSec = [
        caseData.year_of_study ? `Year ${caseData.year_of_study}` : null,
        caseData.section ? `Section ${caseData.section}` : null
      ].filter(Boolean).join(' - ');
      if (yrSec) lines.push(`Year and Section: ${yrSec}`);

      // Include phone number ONLY if WHATSAPP_INCLUDE_PHONE is true
      if (config.WHATSAPP_INCLUDE_PHONE && caseData.phone) {
        lines.push(`Contact Phone: ${caseData.phone}`);
      }
    }
    if (caseData.description) {
      const truncatedDesc = caseData.description.length > 140 
        ? `${caseData.description.substring(0, 140)}...` 
        : caseData.description;
      lines.push(`Description: "${truncatedDesc}"`);
    }
    lines.push(`Audio Available: ${caseData.has_audio ? 'Yes' : 'No'}`);
    lines.push(`Evidence Available: ${caseData.has_evidence ? 'Yes' : 'No'}`);
    lines.push(`Current Status: ${caseData.status}`);
  }

  lines.push('----------------------------------------');
  lines.push('The original audio is stored in SENTINEL. It is shared separately from the Share sheet or by the expiring link below when available.');

  const isPublicHttps = isPublicHttpsUrl(config.APP_BASE_URL);
  let audioLinkIncluded = false;
  let warning = null;

  if (options.audioLinkUrl) {
    if (isPublicHttps) {
      lines.push(`Listen to audio (expires in 24h): ${options.audioLinkUrl}`);
      audioLinkIncluded = true;
    } else {
      warning = 'Public HTTPS URL (APP_BASE_URL) is not configured. Audio playback link omitted from WhatsApp message to avoid unroutable localhost links.';
    }
  }

  // Include case login link ONLY if APP_BASE_URL is a real public HTTPS URL
  if (isPublicHttps) {
    lines.push(`Secure Access: ${config.APP_BASE_URL}/#/cases/${caseData.case_ref} (Auth Required)`);
  }

  const messageText = lines.join('\n');
  const messageHash = crypto.createHash('sha256').update(messageText).digest('hex');

  return {
    level,
    text: messageText,
    hash: messageHash,
    audioLinkIncluded,
    isPublicHttps,
    warning
  };
}

export function buildClickToChatUrl(recipientE164, messageText) {
  // wa.me format: https://wa.me/<digits>?text=<encoded>
  const digits = String(recipientE164).replace(/\D/g, '');
  const encodedText = encodeURIComponent(messageText);
  return `https://wa.me/${digits}?text=${encodedText}`;
}

export class WhatsAppNotificationService {
  prepareNotification(caseId, creatorUserId, options = {}) {
    const caseData = db.prepare(`
      SELECT c.*, l.name as location_name, d.name as department_name,
        u.full_name as student_name, s.sif_number, s.programme, s.year_of_study, s.section, s.phone,
        (SELECT COUNT(*) FROM audio_complaints ac WHERE ac.case_id = c.id) as has_audio,
        (SELECT COUNT(*) FROM evidence ev WHERE ev.case_id = c.id) as has_evidence
      FROM cases c
      LEFT JOIN campus_locations l ON c.campus_location_id = l.id
      LEFT JOIN departments d ON c.department_id = d.id
      LEFT JOIN users u ON c.student_user_id = u.id
      LEFT JOIN students s ON s.user_id = u.id
      WHERE c.id = ?
    `).get(caseId);

    if (!caseData) throw new Error('Case not found');

    const norm = normalizeWhatsAppNumber(
      config.WHATSAPP_RECIPIENT_RAW,
      config.WHATSAPP_DEFAULT_COUNTRY_CODE,
      config.WHATSAPP_COUNTRY_CONFIRMED
    );

    if (!norm.valid) {
      throw new Error(`WhatsApp Configuration Error: ${norm.error}`);
    }

    // Check if an active unrevoked audio link exists for this case
    const nowIso = new Date().toISOString();
    let audioLinkUrl = options.audioLinkUrl || null;
    if (!audioLinkUrl && caseData.has_audio) {
      const activeLink = db.prepare(`
        SELECT * FROM audio_links
        WHERE case_id = ? AND revoked_at IS NULL AND expires_at > ? AND plays_count < max_plays
        ORDER BY id DESC LIMIT 1
      `).get(caseId, nowIso);
      if (activeLink && activeLink.token_hash) {
        // We only have the hash in the DB, raw token is only returned on generation.
      }
    }

    const { level, text, hash, audioLinkIncluded, isPublicHttps, warning } = prepareWhatsAppMessage(caseData, {
      ...options,
      audioLinkUrl
    });

    const clickToChatUrl = buildClickToChatUrl(norm.e164Digits, text);
    const now = new Date().toISOString();

    // Check if notification already prepared
    let existing = db.prepare(`
      SELECT * FROM whatsapp_notifications 
      WHERE case_id = ? AND level = ?
      ORDER BY id DESC LIMIT 1
    `).get(caseId, level);

    let notificationId;
    if (existing) {
      notificationId = existing.id;
    } else {
      const stmt = db.prepare(`
        INSERT INTO whatsapp_notifications (
          case_id, recipient_e164, message_hash, level, state, prepared_at, created_by
        ) VALUES (?, ?, ?, ?, 'prepared', ?, ?)
      `);
      const result = stmt.run(caseId, norm.e164Digits, hash, level, now, creatorUserId);
      notificationId = result.lastInsertRowid;
    }

    return {
      id: notificationId,
      recipient: norm.e164Digits,
      level,
      messageText: text,
      clickToChatUrl,
      state: existing ? existing.state : 'prepared',
      hasAudio: !!caseData.has_audio,
      audioLinkIncluded,
      isPublicHttps,
      warning,
      statusNotice: 'Opening WhatsApp or the share sheet does not prove the message or audio was sent, delivered, or read.'
    };
  }

  recordStateChange(notificationId, newState, actorUserId) {
    // Honest tracking states only:
    // prepared -> opened -> awaiting_manual_send -> audio_share_sheet_opened -> audio_link_created
    // delivery_confirmed is reserved for genuine business API and NEVER allowed here!
    const allowedStates = [
      'prepared',
      'opened',
      'awaiting_manual_send',
      'audio_share_sheet_opened',
      'audio_link_created'
    ];
    if (!allowedStates.includes(newState)) {
      throw new Error(`Invalid or unsupported notification state: ${newState}. Simulated delivery confirmations are strictly prohibited.`);
    }

    const now = new Date().toISOString();
    const updateSql = newState === 'opened'
      ? 'UPDATE whatsapp_notifications SET state = ?, opened_at = ? WHERE id = ?'
      : 'UPDATE whatsapp_notifications SET state = ? WHERE id = ?';

    if (newState === 'opened') {
      db.prepare(updateSql).run(newState, now, notificationId);
    } else {
      db.prepare(updateSql).run(newState, notificationId);
    }

    logAudit({
      actorUserId,
      actorRole: 'system',
      action: 'WHATSAPP_STATE_UPDATE',
      entityType: 'whatsapp_notification',
      entityId: notificationId,
      details: { newState }
    });

    return { success: true, state: newState };
  }
}

export const whatsAppService = new WhatsAppNotificationService();
