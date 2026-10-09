import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeWhatsAppNumber,
  buildClickToChatUrl,
  prepareWhatsAppMessage,
  WhatsAppNotificationService
} from '../../server/notifications/whatsapp.js';

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

test('WhatsApp URL & Unicode Encoding: preserves Tamil text and formatting', () => {
  const tamilText = 'பாதுகாப்பு அறிக்கை: Ragging alert near Hostel Block 3';
  const url = buildClickToChatUrl('917708704229', tamilText);

  assert.ok(url.startsWith('https://wa.me/917708704229?text='));
  assert.ok(!url.includes('+91')); // Must contain digits only
  assert.ok(url.includes(encodeURIComponent(tamilText)));
});

test('WhatsApp Message Levels: Minimal vs Extended separation', () => {
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
    sif_number: 'SIF202601',
    description: 'Verbal harassment and threat',
    has_audio: 1,
    has_evidence: 0,
    status: 'Submitted'
  };

  const minMsg = prepareWhatsAppMessage(dummyCase, { level: 'minimal' });
  assert.ok(minMsg.text.includes('SNT-261009-TESTCASE'));
  assert.ok(minMsg.text.includes('URGENT'));
  assert.ok(!minMsg.text.includes('Priya Sharma'), 'Minimal message must exclude student name');

  const extMsg = prepareWhatsAppMessage(dummyCase, { level: 'extended' });
  assert.ok(extMsg.text.includes('Priya Sharma'), 'Extended message includes student name');
  assert.ok(extMsg.text.includes('Ragging'));
});

test('WhatsApp Honest States: Rejects fake delivery confirmations', () => {
  const service = new WhatsAppNotificationService();
  assert.throws(() => {
    service.recordStateChange(1, 'delivery_confirmed', 1);
  }, /Simulated delivery confirmations are strictly prohibited/);
});
