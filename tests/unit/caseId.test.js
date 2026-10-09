import test from 'node:test';
import assert from 'node:assert/strict';
import { generateUniqueCaseRef } from '../../server/utils/caseId.js';

test('Case ID Generator: format and uniqueness over 1,000 iterations', () => {
  const generated = new Set();
  const formatRegex = /^SNT-\d{6}-[A-Z2-9]{8}$/;

  for (let i = 0; i < 1000; i++) {
    const id = generateUniqueCaseRef();
    assert.match(id, formatRegex, `Case ID ${id} must match SNT-YYMMDD-XXXXXXXX format`);
    assert.equal(generated.has(id), false, `Collision detected on ID: ${id}`);
    generated.add(id);
  }

  assert.equal(generated.size, 1000, 'Must produce 1,000 unique non-guessable identifiers');
});
