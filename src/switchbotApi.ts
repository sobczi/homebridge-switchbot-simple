import { createHmac, randomUUID } from 'node:crypto';

const API_BASE_URL = 'https://api.switch-bot.com/v1.1';

export interface SwitchBotClient {
  getStatus(deviceId: string): Promise<boolean>;
  setPower(deviceId: string, on: boolean): Promise<void>;
  getCurtainStatus(deviceId: string): Promise<CurtainStatus>;
  setCurtainPosition(deviceId: string, position: number): Promise<void>;
  pauseCurtain(deviceId: string): Promise<void>;
}

export interface CurtainStatus {
  slidePosition: number;
  moving: boolean;
  calibrate: boolean;
  battery?: number;
  version?: string;
}

interface SwitchBotResponse {
  statusCode: number;
  message?: string;
  body?: {
    power?: string;
    slidePosition?: string | number;
    moving?: boolean;
    calibrate?: boolean;
    battery?: number;
    version?: string;
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
    await this.sendCommand(deviceId, on ? 'turnOn' : 'turnOff');
  }

  async getCurtainStatus(deviceId: string): Promise<CurtainStatus> {
    const response = await this.request(`/devices/${encodeURIComponent(deviceId)}/status`);
    const slidePosition = Number(response.body?.slidePosition);
    if (!Number.isFinite(slidePosition) || slidePosition < 0 || slidePosition > 100 || typeof response.body?.moving !== 'boolean') {
      throw new Error(`SwitchBot status for ${deviceId} did not include a valid Curtain 3 position.`);
    }

    return {
      slidePosition,
      moving: response.body.moving,
      calibrate: response.body.calibrate === true,
      battery: response.body.battery,
      version: response.body.version,
    };
  }

  async setCurtainPosition(deviceId: string, position: number): Promise<void> {
    const boundedPosition = Math.round(Math.max(0, Math.min(100, position)));
    await this.sendCommand(deviceId, 'setPosition', `0,ff,${boundedPosition}`);
  }

  async pauseCurtain(deviceId: string): Promise<void> {
    await this.sendCommand(deviceId, 'pause');
  }

  private async sendCommand(deviceId: string, command: string, parameter = 'default'): Promise<void> {
    await this.request(`/devices/${encodeURIComponent(deviceId)}/commands`, {
      method: 'POST',
      body: JSON.stringify({ command, parameter, commandType: 'command' }),
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
