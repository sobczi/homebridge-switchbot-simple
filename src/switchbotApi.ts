import { createHmac, randomUUID } from 'node:crypto';

const API_BASE_URL = 'https://api.switch-bot.com/v1.1';

export interface SwitchBotClient {
  getStatus(deviceId: string): Promise<boolean>;
  setPower(deviceId: string, on: boolean): Promise<void>;
}

interface SwitchBotResponse {
  statusCode: number;
  message?: string;
  body?: {
    power?: string;
  };
}

export interface SwitchBotApiClientOptions {
  token: string;
  secret: string;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  nonce?: () => string;
}

export class SwitchBotApiClient implements SwitchBotClient {
  private readonly fetch: typeof globalThis.fetch;
  private readonly now: () => number;
  private readonly nonce: () => string;

  constructor(private readonly options: SwitchBotApiClientOptions) {
    this.fetch = options.fetch ?? globalThis.fetch;
    this.now = options.now ?? Date.now;
    this.nonce = options.nonce ?? randomUUID;
  }

  async getStatus(deviceId: string): Promise<boolean> {
    const response = await this.request(`/devices/${encodeURIComponent(deviceId)}/status`);
    const power = response.body?.power;

    if (power !== 'on' && power !== 'off') {
      throw new Error(`SwitchBot status for ${deviceId} did not include a supported power value.`);
    }

    return power === 'on';
  }

  async setPower(deviceId: string, on: boolean): Promise<void> {
    await this.request(`/devices/${encodeURIComponent(deviceId)}/commands`, {
      method: 'POST',
      body: JSON.stringify({ command: on ? 'turnOn' : 'turnOff', parameter: 'default', commandType: 'command' }),
    });
  }

  private async request(path: string, init: RequestInit = {}): Promise<SwitchBotResponse> {
    const timestamp = String(this.now());
    const nonce = this.nonce();
    const sign = createHmac('sha256', this.options.secret)
      .update(`${this.options.token}${timestamp}${nonce}`)
      .digest('base64')
      .toUpperCase();
    const response = await this.fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        'Authorization': this.options.token,
        'Content-Type': 'application/json',
        'sign': sign,
        'nonce': nonce,
        't': timestamp,
        ...init.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`SwitchBot API request failed with HTTP ${response.status}.`);
    }

    const payload = await response.json() as SwitchBotResponse;
    if (payload.statusCode !== 100) {
      throw new Error(`SwitchBot API request failed: ${payload.message ?? `status ${payload.statusCode}`}.`);
    }

    return payload;
  }
}
