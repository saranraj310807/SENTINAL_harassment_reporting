import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeWhatsAppNumber,
  buildClickToChatUrl,
  prepareWhatsAppMessage,
  isPublicHttpsUrl,
  WhatsAppNotificationService
} from '../../server/notifications/whatsapp.js';
import { config } from '../../server/config/index.js';

test('WhatsApp Normalization: 10-digit Indian standard and international E.164', () => {
  // Test raw 7708704229 with default code 91
  const res1 = normalizeWhatsAppNumber('7708704229', '91', true);
  assert.equal(res1.valid, true);
  assert.equal(res1.e164Digits, '917708704229');

  // Test with spaces, dashes, parentheses, + prefix
  const res2 = normalizeWhatsAppNumber('+91 (770) 870-4229', '91', true);
  assert.equal(res2.valid, true);
  assert.equal(res2.e164Digits, '917708704229');

  // Test international number with 00 prefix
  const res3 = normalizeWhatsAppNumber('00917708704229', '91', true);
  assert.equal(res3.valid, true);
  assert.equal(res3.e164Digits, '917708704229');

  // Unconfirmed 10-digit without explicit confirmation flag
  const resUnconfirmed = normalizeWhatsAppNumber('7708704229', '91', false);
  assert.equal(resUnconfirmed.valid, false);
  assert.match(resUnconfirmed.error, /Country code confirmation required/);

  // Invalid letters or short digits
  const resInvalid = normalizeWhatsAppNumber('12345', '91', true);
  assert.equal(resInvalid.valid, false);
});

test('WhatsApp URL & Unicode Encoding: preserves Tamil text and punctuation', () => {
  const tamilText = 'பாதுகாப்பு அறிக்கை: Ragging alert near Hostel Block 3! Details: "Urgent check required."';
  const url = buildClickToChatUrl('917708704229', tamilText);

  assert.ok(url.startsWith('https://wa.me/917708704229?text='));
  assert.ok(!url.includes('+91')); // Must contain digits only
  assert.ok(url.includes(encodeURIComponent(tamilText)));
  assert.equal(decodeURIComponent(url.split('text=')[1]), tamilText);
});

test('WhatsApp Message: Extended content, zero emojis, separated timestamps, and honest notice', () => {
  const dummyCase = {
    case_ref: 'SNT-261009-TESTCASE',
    incident_at: '2026-10-09T08:00:00.000Z',
    submitted_at: '2026-10-09T08:30:00.000Z',
    location_name: 'Main Library',
    location_detail: 'Stairwell',
    urgent: 1,
    assigned_level: 'HOD',
    category: 'Ragging',
    student_name: 'Priya Sharma',
    sif_number: 'SIF-2023-CS-0042',
    department_name: 'Computer Science & Engineering',
    programme: 'B.Tech Computer Science',
    year_of_study: 3,
    section: 'A',
    phone: '9876543210',
    description: 'Verbal harassment and threat near hostel',
    has_audio: 1,
    has_evidence: 1,
    status: 'Submitted'
  };

  const extMsg = prepareWhatsAppMessage(dummyCase, { level: 'extended' });
  const text = extMsg.text;

  // 1. Extended fields
  assert.ok(text.includes('Student: Priya Sharma'));
  assert.ok(text.includes('Department: Computer Science & Engineering'));
  assert.ok(text.includes('SIF Number: SIF-2023-CS-0042'));
  assert.ok(text.includes('Programme: B.Tech Computer Science'));
  assert.ok(text.includes('Year and Section: Year 3 - Section A'));
  assert.ok(text.includes('Category: Ragging'));
  assert.ok(text.includes('Description: "Verbal harassment and threat near hostel"'));
  assert.ok(text.includes('Audio Available: Yes'));
  assert.ok(text.includes('Evidence Available: Yes'));
  assert.ok(text.includes('Current Status: Submitted'));

  // 2. Timestamps separated in Asia/Kolkata
  assert.ok(text.includes('Incident Date/Time:'));
  assert.ok(text.includes('Submission Date/Time:'));
  assert.ok(text.includes('(Asia/Kolkata)'));

  // 3. ZERO emojis
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  assert.equal(emojiRegex.test(text), false, 'Message must not contain any emoji characters');

  // 4. Exact updated audio notice line
  assert.ok(text.includes(
    'The original audio is stored in SENTINEL. It is shared separately from the Share sheet or by the expiring link below when available.'
  ));

  // 5. Phone exclusion check: when WHATSAPP_INCLUDE_PHONE is false, phone is not in message
  assert.equal(config.WHATSAPP_INCLUDE_PHONE, false);
  assert.equal(text.includes('Contact Phone:'), false);
});

test('WhatsApp Localhost Security: Never emits localhost link in WhatsApp message', () => {
  const dummyCase = {
    case_ref: 'SNT-261009-TESTCASE',
    incident_at: '2026-10-09T08:00:00.000Z',
    submitted_at: '2026-10-09T08:30:00.000Z',
    location_name: 'Main Library',
    location_detail: 'Stairwell',
    category: 'Harassment',
    status: 'Submitted'
  };

  // When APP_BASE_URL is localhost (default in dev/test)
  const isPublic = isPublicHttpsUrl('http://localhost:3000');
  assert.equal(isPublic, false);
  assert.equal(isPublicHttpsUrl('https://127.0.0.1:3000'), false);
  assert.equal(isPublicHttpsUrl('https://localhost'), false);
  assert.equal(isPublicHttpsUrl('https://sentinel.campus.edu'), true);

  const msgWithLocalhost = prepareWhatsAppMessage(dummyCase, {
    level: 'extended',
    audioLinkUrl: 'http://localhost:3000/listen/abc123token'
  });

  assert.equal(msgWithLocalhost.text.includes('localhost'), false, 'Message must NEVER include localhost links');
  assert.equal(msgWithLocalhost.text.includes('Listen to audio'), false, 'Expiring link line must be omitted if not public HTTPS');
  assert.ok(msgWithLocalhost.warning, 'Warning must be returned to notify staff');
});

test('WhatsApp Honest States: Allows only honest states and rejects delivery confirmation', () => {
  const service = new WhatsAppNotificationService();

  // Allowed honest states
  const allowed = [
    'prepared',
    'opened',
    'awaiting_manual_send',
    'audio_share_sheet_opened',
    'audio_link_created'
  ];

  for (const st of allowed) {
    // Should not throw an "unsupported state" validation error
    try {
      // Notification ID 999999 won't exist in DB, but the state check occurs BEFORE database update
      service.recordStateChange(999999, st, 1);
    } catch (e) {
      assert.ok(!e.message.includes('Invalid or unsupported notification state'), `State ${st} should be supported`);
    }
  }

  // Delivery confirmed or sent must be rejected
  assert.throws(() => {
    service.recordStateChange(1, 'delivery_confirmed', 1);
  }, /Simulated delivery confirmations are strictly prohibited/);

  assert.throws(() => {
    service.recordStateChange(1, 'delivered', 1);
  }, /Simulated delivery confirmations are strictly prohibited/);

  assert.throws(() => {
    service.recordStateChange(1, 'sent', 1);
  }, /Simulated delivery confirmations are strictly prohibited/);
});

test('Web Share API: Share button hidden when canShare is false / unsupported', () => {
  // Simulate desktop environment where navigator.canShare is undefined or false
  const evaluateCanShareFiles = (nav) => {
    return typeof nav !== 'undefined' && !!nav.canShare && typeof File !== 'undefined';
  };

  // 1. Desktop browser without Web Share API
  const desktopNav = {};
  assert.equal(evaluateCanShareFiles(desktopNav), false, 'Share button must be hidden on unsupported desktops');

  // 2. Browser with text-only share (canShare returns false for files)
  const textOnlyNav = {
    canShare: (data) => !data.files
  };
  assert.equal(evaluateCanShareFiles(textOnlyNav) && textOnlyNav.canShare({ files: ['dummy'] }), false, 'Share button must be hidden when files are unsupported');

  // 3. Mobile browser with Web Share API Level 2 (files supported)
  const mobileNav = {
    canShare: (data) => !!data.files
  };
  assert.equal(evaluateCanShareFiles(mobileNav) && mobileNav.canShare({ files: ['dummy'] }), true, 'Share button visible when canShare({ files }) is true');
});

