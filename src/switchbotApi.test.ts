import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';

import { SwitchBotApiClient } from './switchbotApi.js';

test('getStatus signs and reads an on response', async () => {
  let request: Request | undefined;
  const client = new SwitchBotApiClient({
    token: 'token',
    secret: 'secret',
    now: () => 1700000000000,
    nonce: () => 'nonce',
    fetch: async (input, init) => {
      request = new Request(input, init);
      return new Response(JSON.stringify({ statusCode: 100, body: { power: 'on' } }), { status: 200 });
    },
  });

  assert.equal(await client.getStatus('device id'), true);
  assert.equal(request?.url, 'https://api.switch-bot.com/v1.1/devices/device%20id/status');
  assert.equal(request?.headers.get('authorization'), 'token');
  assert.equal(request?.headers.get('t'), '1700000000000');
  assert.equal(request?.headers.get('nonce'), 'nonce');
  assert.equal(
    request?.headers.get('sign'),
    createHmac('sha256', 'secret').update('token1700000000000nonce').digest('base64').toUpperCase(),
  );
});

test('setPower sends the corresponding SwitchBot command', async () => {
  let request: Request | undefined;
  const client = new SwitchBotApiClient({
    token: 'token',
    secret: 'secret',
    fetch: async (input, init) => {
      request = new Request(input, init);
      return new Response(JSON.stringify({ statusCode: 100 }), { status: 200 });
    },
  });

  await client.setPower('device', false);
  assert.equal(request?.method, 'POST');
  assert.deepEqual(await request?.json(), { command: 'turnOff', parameter: 'default', commandType: 'command' });
});

test('reads Curtain 3 status and sends its documented position command', async () => {
  const requests: Request[] = [];
  const client = new SwitchBotApiClient({
    token: 'token',
    secret: 'secret',
    fetch: async (input, init) => {
      requests.push(new Request(input, init));
      if (requests.length === 1) {
        return new Response(JSON.stringify({
          statusCode: 100,
          body: { slidePosition: 100, moving: false, calibrate: true, battery: 80, version: 'V1.2' },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ statusCode: 100 }), { status: 200 });
    },
  });

  assert.deepEqual(await client.getCurtainStatus('curtain'), {
    slidePosition: 100,
    moving: false,
    calibrate: true,
    battery: 80,
    version: 'V1.2',
  });
  await client.setCurtainPosition('curtain', 20);
  assert.deepEqual(await requests[1].json(), {
    command: 'setPosition',
    parameter: '0,ff,20',
    commandType: 'command',
  });
});

test('reads Hub 2 temperature and humidity', async () => {
  const client = new SwitchBotApiClient({
    token: 'token',
    secret: 'secret',
    fetch: async () => new Response(JSON.stringify({
      statusCode: 100,
      body: { temperature: 26.4, humidity: 50 },
    }), { status: 200 }),
  });

  assert.deepEqual(await client.getHub2Status('hub'), { temperature: 26.4, humidity: 50 });
});

test('rejects unsuccessful API payloads', async () => {
  const client = new SwitchBotApiClient({
    token: 'token',
    secret: 'secret',
    fetch: async () => new Response(JSON.stringify({ statusCode: 190, message: 'device error' }), { status: 200 }),
  });

  await assert.rejects(client.getStatus('device'), /device error/);
});
