import type { API, Characteristic, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig, Service } from 'homebridge';

import { SwitchBotCurtainAccessory } from './curtainAccessory.js';
import { SwitchBotHub2Accessory } from './hub2Accessory.js';
import { SwitchBotPlatformAccessory } from './platformAccessory.js';
import { PLUGIN_NAME, PLATFORM_NAME } from './settings.js';
import { SwitchBotApiClient, type SwitchBotClient } from './switchbotApi.js';

export interface SwitchBotDeviceConfig {
  name: string;
  deviceId: string;
  type?: 'switch' | 'curtain3' | 'hub2';
}

interface SwitchBotPlatformConfig extends PlatformConfig {
  token?: string;
  secret?: string;
  refreshInterval?: number;
  devices?: SwitchBotDeviceConfig[];
}

function resolveEnvironmentValue(value: string | undefined): string | undefined {
  const variable = value?.match(/^\$\{([A-Z0-9_]+)\}$/)?.[1];
  return variable ? process.env[variable] : value;
}

export class SwitchBotSimplePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly accessories = new Map<string, PlatformAccessory>();
  public readonly client?: SwitchBotClient;
  public readonly refreshInterval: number;
  private readonly devices: SwitchBotDeviceConfig[];

  constructor(
    public readonly log: Logging,
    public readonly config: SwitchBotPlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;
    this.devices = this.validDevices(config.devices);
    this.refreshInterval = this.validRefreshInterval(config.refreshInterval);

    const token = resolveEnvironmentValue(config.token);
    const secret = resolveEnvironmentValue(config.secret);
    if (token && secret) {
      this.client = new SwitchBotApiClient({ token, secret });
    } else {
      this.log.error('SwitchBot Simple is disabled: configure token and secret (or ${ENVIRONMENT_VARIABLE} placeholders).');
    }

    this.api.on('didFinishLaunching', () => this.discoverDevices());
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.set(accessory.UUID, accessory);
  }

  private discoverDevices(): void {
    if (!this.client) {
      return;
    }

    const activeUuids = new Set<string>();
    for (const device of this.devices) {
      const uuid = this.api.hap.uuid.generate(device.deviceId);
      activeUuids.add(uuid);
      const cached = this.accessories.get(uuid);

      if (cached) {
        cached.context.device = device;
        this.api.updatePlatformAccessories([cached]);
        this.createAccessory(cached, device);
      } else {
        this.log.info('Adding accessory:', device.name);
        const accessory = new this.api.platformAccessory(device.name, uuid);
        accessory.context.device = device;
        this.createAccessory(accessory, device);
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }

    for (const [uuid, accessory] of this.accessories) {
      if (!activeUuids.has(uuid)) {
        this.log.info('Removing accessory no longer present in config:', accessory.displayName);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }
  }

  private createAccessory(accessory: PlatformAccessory, device: SwitchBotDeviceConfig): void {
    if (device.type === 'curtain3') {
      new SwitchBotCurtainAccessory(this, accessory, this.client!);
    } else if (device.type === 'hub2') {
      new SwitchBotHub2Accessory(this, accessory, this.client!);
    } else {
      new SwitchBotPlatformAccessory(this, accessory, this.client!);
    }
  }

  private validDevices(devices: SwitchBotDeviceConfig[] | undefined): SwitchBotDeviceConfig[] {
    if (!Array.isArray(devices)) {
      this.log.warn('No SwitchBot devices configured.');
      return [];
    }
    return devices.filter((device): device is SwitchBotDeviceConfig => {
      const validType = device?.type === undefined || device.type === 'switch' || device.type === 'curtain3' || device.type === 'hub2';
      const valid = validType && typeof device?.name === 'string' && device.name.length > 0
        && typeof device.deviceId === 'string' && device.deviceId.length > 0;
      if (!valid) {
        this.log.warn('Ignoring an invalid SwitchBot device configuration.');
      }
      return valid;
    });
  }

  private validRefreshInterval(value: number | undefined): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return 60;
    }
    return Math.max(10, Math.floor(value));
  }
}
