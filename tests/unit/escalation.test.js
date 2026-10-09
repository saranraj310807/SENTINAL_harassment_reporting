import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateRelationshipScore,
  calculateLevelFromCount,
  ensureNoDowngrade,
  DEFAULT_POLICY
} from '../../server/engine/escalation.js';

test('Escalation Engine: Pure Scoring Function', () => {
  const caseA = {
    category: 'Ragging',
    campus_location_id: 1,
    zone: 'South',
    incident_at: '2026-10-01T10:00:00.000Z',
    suspect_details: 'Senior student dark jacket tall athletic',
    department_id: 1
  };

  const caseB = {
    category: 'Ragging',
    campus_location_id: 1,
    zone: 'South',
    incident_at: '2026-10-05T11:00:00.000Z', // 4 days later, morning band
    suspect_details: 'Senior student dark jacket corridor',
    department_id: 1
  };

  const result = calculateRelationshipScore(caseA, caseB, DEFAULT_POLICY);

  // Category (+30) + Location (+25) + Recency <=14d (+15) + TimeOfDay morning (+10) + Suspect keywords (+20) + dept cap (+3) = 100
  assert.equal(result.isPotential, true);
  assert.ok(result.score >= 50, `Score must exceed threshold 50 (got ${result.score})`);
  assert.equal(result.matchedFactors.length >= 4, true);
});

test('Escalation Safeguard: Name or department alone can NEVER reach threshold', () => {
  const caseX = {
    category: 'Verbal abuse/Intimidation',
    campus_location_id: 1,
    zone: 'North',
    incident_at: '2026-08-01T10:00:00.000Z',
    suspect_details: 'Rohan Sharma CSE Dept',
    department_id: 1
  };

  const caseY = {
    category: 'Other',
    campus_location_id: 5,
    zone: 'West',
    incident_at: '2026-10-01T22:00:00.000Z', // > 30 days apart, different band
    suspect_details: 'Rohan Sharma CSE Dept',
    department_id: 1
  };

  const result = calculateRelationshipScore(caseX, caseY, DEFAULT_POLICY);
  assert.equal(result.isPotential, false, 'Name/dept alone must not trigger threshold');
  assert.ok(result.score < DEFAULT_POLICY.threshold, `Score must remain well below threshold 50 (got ${result.score})`);
});

test('Escalation Level Rules: 1 -> HOD, 2 -> Dean, 3+ -> Higher Authority', () => {
  assert.equal(calculateLevelFromCount(1), 'HOD');
  assert.equal(calculateLevelFromCount(2), 'Dean');
  assert.equal(calculateLevelFromCount(3), 'Higher Authority');
  assert.equal(calculateLevelFromCount(5), 'Higher Authority');
});

test('Escalation Guarantee: Levels NEVER downgrade', () => {
  assert.equal(ensureNoDowngrade('Dean', 'HOD'), 'Dean');
  assert.equal(ensureNoDowngrade('Higher Authority', 'Dean'), 'Higher Authority');
  assert.equal(ensureNoDowngrade('Higher Authority', 'HOD'), 'Higher Authority');
  assert.equal(ensureNoDowngrade('HOD', 'Dean'), 'Dean');
});

test('Demo Helper Verification: Presets A, B, C relate with score >= 50, Preset D remains unrelated', () => {
  const presetA = {
    category: 'Ragging',
    campus_location_id: 4,
    zone: 'South',
    incident_at: '2026-10-05T20:00:00.000Z', // Evening
    suspect_details: 'Three senior students dark hoodies hostel 3'
  };

  const presetB = {
    category: 'Ragging',
    campus_location_id: 4,
    zone: 'South',
    incident_at: '2026-10-07T21:00:00.000Z', // Evening, 2 days apart
    suspect_details: 'Three senior students dark hoodies corridor'
  };

  const presetC = {
    category: 'Ragging',
    campus_location_id: 4,
    zone: 'South',
    incident_at: '2026-10-08T20:30:00.000Z', // Evening, 1 day apart
    suspect_details: 'Senior students dark hoodies hostel 3 entrance'
  };

  const presetD = {
    category: 'Other',
    campus_location_id: 1,
    zone: 'North',
    incident_at: '2026-09-01T14:00:00.000Z', // Afternoon, 35 days apart
    suspect_details: 'Unknown library patron'
  };

  // A and B must match
  const scoreAB = calculateRelationshipScore(presetA, presetB, DEFAULT_POLICY);
  assert.ok(scoreAB.score >= 50, `Preset A & B must score >= 50 (got ${scoreAB.score})`);

  // B and C must match
  const scoreBC = calculateRelationshipScore(presetB, presetC, DEFAULT_POLICY);
  assert.ok(scoreBC.score >= 50, `Preset B & C must score >= 50 (got ${scoreBC.score})`);

  // A and D must NOT match
  const scoreAD = calculateRelationshipScore(presetA, presetD, DEFAULT_POLICY);
  assert.ok(scoreAD.score < 50, `Preset A & D must score < 50 (got ${scoreAD.score})`);
});
