import test from 'node:test';
import assert from 'node:assert/strict';
import {
  complaintSchema,
  registerStudentSchema,
  loginSchema
} from '../../server/utils/validation.js';

test('Validation: Rejects future incident timestamp', () => {
  const futureDate = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString();
  assert.throws(() => {
    complaintSchema.parse({
      category: 'Ragging',
      incident_at: futureDate,
      campus_location_id: 1,
      submission_token: 'test-token-12345'
    });
  }, /Incident date and time cannot be in the future/);
});

test('Validation: Accepts current or past incident timestamp', () => {
  const pastDate = new Date(Date.now() - 3600 * 1000).toISOString();
  const valid = complaintSchema.parse({
    category: 'Ragging',
    incident_at: pastDate,
    campus_location_id: 1,
    submission_token: 'valid-token-12345'
  });
  assert.equal(valid.category, 'Ragging');
  assert.equal(valid.submission_token, 'valid-token-12345');
});

test('Validation: Student SIF format and Indian phone number validation', () => {
  // Valid student
  const valid = registerStudentSchema.parse({
    email: 'student.test@campus.edu',
    password: 'password123',
    full_name: 'Test Student',
    sif_number: 'SIF202642',
    department_id: 1,
    programme: 'B.Tech CSE',
    year_of_study: 3,
    section: 'A',
    phone: '9840112233'
  });
  assert.equal(valid.sif_number, 'SIF202642');

  // Invalid SIF format
  assert.throws(() => {
    registerStudentSchema.parse({
      email: 'student.test@campus.edu',
      password: 'password123',
      full_name: 'Test Student',
      sif_number: 'INVALID_SIF',
      department_id: 1,
      programme: 'B.Tech CSE',
      year_of_study: 3,
      section: 'A',
      phone: '9840112233'
    });
  }, /SIF number must follow format/);

  // Invalid phone number (e.g. 12345 or starts with 0)
  assert.throws(() => {
    registerStudentSchema.parse({
      email: 'student.test@campus.edu',
      password: 'password123',
      full_name: 'Test Student',
      sif_number: 'SIF202642',
      department_id: 1,
      programme: 'B.Tech CSE',
      year_of_study: 3,
      section: 'A',
      phone: '1234567890'
    });
  }, /valid 10-digit Indian mobile/);
});
