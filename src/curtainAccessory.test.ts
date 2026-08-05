import assert from 'node:assert/strict';
import test from 'node:test';

import { MOVEMENT_POLL_INTERVAL_MS, MOVEMENT_POLL_TIMEOUT_MS, fromSwitchBotPosition, toSwitchBotPosition } from './curtainAccessory.js';

test('translates opposite Curtain 3 and HomeKit position conventions', () => {
  assert.equal(fromSwitchBotPosition(0), 100);
  assert.equal(fromSwitchBotPosition(100), 0);
  assert.equal(toSwitchBotPosition(100), 0);
  assert.equal(toSwitchBotPosition(0), 100);
});

test('uses a short bounded polling cadence while a Curtain 3 is moving', () => {
  assert.equal(MOVEMENT_POLL_INTERVAL_MS, 3000);
  assert.equal(MOVEMENT_POLL_TIMEOUT_MS, 90000);
});
