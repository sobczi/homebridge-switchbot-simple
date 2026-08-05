import assert from 'node:assert/strict';
import process from 'node:process';
import test from 'node:test';

import { SwitchBotApiClient } from '../dist/switchbotApi.js';

const token = process.env.SWITCHBOT_TOKEN;
const secret = process.env.SWITCHBOT_SECRET;
const deviceIds = [process.env.SWITCHBOT_LED_ID, process.env.SWITCHBOT_LAMP_ID].filter(Boolean);
const canRead = Boolean(token && secret && deviceIds.length > 0);

test('reads configured SwitchBot device states', {
  skip: !canRead && 'Set SWITCHBOT_TOKEN, SWITCHBOT_SECRET, and at least one device ID to run.',
}, async () => {
  const client = new SwitchBotApiClient({ token, secret });
  for (const deviceId of deviceIds) {
    assert.equal(typeof await client.getStatus(deviceId), 'boolean');
  }
});

const curtainId = process.env.SWITCHBOT_CURTAIN_ID;
test('reads the configured Curtain 3 status', {
  skip: !(token && secret && curtainId) && 'Set SWITCHBOT_TOKEN, SWITCHBOT_SECRET, and SWITCHBOT_CURTAIN_ID to run.',
}, async () => {
  const client = new SwitchBotApiClient({ token, secret });
  const status = await client.getCurtainStatus(curtainId);
  assert.equal(typeof status.slidePosition, 'number');
  assert.equal(typeof status.moving, 'boolean');
});

const hub2Id = process.env.SWITCHBOT_HUB2_ID;
test('reads the configured Hub 2 sensors', {
  skip: !(token && secret && hub2Id) && 'Set SWITCHBOT_TOKEN, SWITCHBOT_SECRET, and SWITCHBOT_HUB2_ID to run.',
}, async () => {
  const client = new SwitchBotApiClient({ token, secret });
  const status = await client.getHub2Status(hub2Id);
  assert.equal(typeof status.temperature, 'number');
  assert.equal(typeof status.humidity, 'number');
});

const controlDeviceId = process.env.SWITCHBOT_CONTROL_DEVICE_ID;
const controlTarget = process.env.SWITCHBOT_CONTROL_TARGET;
const canControl = process.env.ALLOW_DEVICE_CONTROL === '1'
  && Boolean(token && secret && controlDeviceId && (controlTarget === 'on' || controlTarget === 'off'));

test('changes the explicitly selected SwitchBot device state', {
  skip: !canControl && 'Set ALLOW_DEVICE_CONTROL=1, SWITCHBOT_CONTROL_DEVICE_ID, and SWITCHBOT_CONTROL_TARGET=on|off to run.',
}, async () => {
  const client = new SwitchBotApiClient({ token, secret });
  await client.setPower(controlDeviceId, controlTarget === 'on');
});
