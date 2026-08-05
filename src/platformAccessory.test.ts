import assert from 'node:assert/strict';
import test from 'node:test';

import { MAX_POWER_CONFIRMATION_ATTEMPTS, POWER_CONFIRMATION_DELAY_MS } from './platformAccessory.js';

test('uses bounded background confirmation for optimistic switch updates', () => {
  assert.equal(POWER_CONFIRMATION_DELAY_MS, 3000);
  assert.equal(MAX_POWER_CONFIRMATION_ATTEMPTS, 4);
});
