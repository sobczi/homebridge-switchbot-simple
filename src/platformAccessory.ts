import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';

import type { SwitchBotDeviceConfig, SwitchBotSimplePlatform } from './platform.js';
import type { SwitchBotClient } from './switchbotApi.js';

export const POWER_CONFIRMATION_DELAY_MS = 3000;
export const MAX_POWER_CONFIRMATION_ATTEMPTS = 4;

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class SwitchBotPlatformAccessory {
  private readonly service: Service;
  private isOn = false;
  private readonly poller: NodeJS.Timeout;
  private readonly device: SwitchBotDeviceConfig;
  private pendingPower?: boolean;
  private confirmationAttempts = 0;
  private confirmationTimer?: NodeJS.Timeout;

  constructor(
    private readonly platform: SwitchBotSimplePlatform,
    private readonly accessory: PlatformAccessory,
    private readonly client: SwitchBotClient,
  ) {
    this.device = accessory.context.device as SwitchBotDeviceConfig;
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'SwitchBot')
      .setCharacteristic(this.platform.Characteristic.Model, 'OpenAPI switch')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.device.deviceId);

    this.service = accessory.getService(this.platform.Service.Switch)
      ?? accessory.addService(this.platform.Service.Switch, this.device.name);
    this.service.setCharacteristic(this.platform.Characteristic.Name, this.device.name);
    this.service.getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setOn.bind(this))
      .onGet(this.getOn.bind(this));

    this.poller = setInterval(() => void this.refreshStatus(), this.platform.refreshInterval * 1000);
    this.poller.unref();
    void this.refreshStatus();
  }

  async refreshStatus(): Promise<void> {
    try {
      const reportedPower = await this.client.getStatus(this.device.deviceId);
      if (this.pendingPower !== undefined && reportedPower !== this.pendingPower) {
        this.platform.log.debug(`${this.device.name}: retaining optimistic power=${this.pendingPower ? 'on' : 'off'} while cloud status catches up`);
        return;
      }
      this.pendingPower = undefined;
      this.isOn = reportedPower;
      this.service.updateCharacteristic(this.platform.Characteristic.On, this.isOn);
      this.platform.log.debug(`${this.device.name}: refreshed power=${this.isOn ? 'on' : 'off'}`);
    } catch (error) {
      this.platform.log.warn(`${this.device.name}: unable to refresh SwitchBot status: ${formatError(error)}`);
    }
  }

  private setOn(value: CharacteristicValue): void {
    const on = Boolean(value);
    const previous = this.isOn;
    this.isOn = on;
    this.pendingPower = on;
    this.confirmationAttempts = 0;
    this.service.updateCharacteristic(this.platform.Characteristic.On, on);
    void this.sendPowerCommand(on, previous);
  }

  private async sendPowerCommand(on: boolean, previous: boolean): Promise<void> {
    try {
      await this.client.setPower(this.device.deviceId, on);
      this.schedulePowerConfirmation();
    } catch (error) {
      this.pendingPower = undefined;
      this.isOn = previous;
      this.service.updateCharacteristic(this.platform.Characteristic.On, previous);
      this.platform.log.error(`${this.device.name}: unable to set SwitchBot power: ${formatError(error)}`);
    }
  }

  private schedulePowerConfirmation(): void {
    if (this.confirmationTimer) {
      clearTimeout(this.confirmationTimer);
    }
    this.confirmationTimer = setTimeout(() => void this.confirmPower(), POWER_CONFIRMATION_DELAY_MS);
    this.confirmationTimer.unref();
  }

  private async confirmPower(): Promise<void> {
    this.confirmationTimer = undefined;
    if (this.pendingPower === undefined) {
      return;
    }

    try {
      const reportedPower = await this.client.getStatus(this.device.deviceId);
      if (reportedPower === this.pendingPower) {
        this.isOn = reportedPower;
        this.pendingPower = undefined;
        this.service.updateCharacteristic(this.platform.Characteristic.On, this.isOn);
        return;
      }
      this.confirmationAttempts += 1;
      if (this.confirmationAttempts < MAX_POWER_CONFIRMATION_ATTEMPTS) {
        this.schedulePowerConfirmation();
        return;
      }
      this.pendingPower = undefined;
      this.isOn = reportedPower;
      this.service.updateCharacteristic(this.platform.Characteristic.On, this.isOn);
      this.platform.log.warn(`${this.device.name}: cloud status did not confirm the requested power state`);
    } catch (error) {
      this.confirmationAttempts += 1;
      if (this.confirmationAttempts < MAX_POWER_CONFIRMATION_ATTEMPTS) {
        this.schedulePowerConfirmation();
      } else {
        this.pendingPower = undefined;
        this.platform.log.warn(`${this.device.name}: unable to confirm requested power state: ${formatError(error)}`);
      }
    }
  }

  private async getOn(): Promise<CharacteristicValue> {
    await this.refreshStatus();
    return this.isOn;
  }
}
