import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';

import type { SwitchBotDeviceConfig, SwitchBotSimplePlatform } from './platform.js';
import type { SwitchBotClient } from './switchbotApi.js';

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class SwitchBotPlatformAccessory {
  private readonly service: Service;
  private isOn = false;
  private readonly poller: NodeJS.Timeout;
  private readonly device: SwitchBotDeviceConfig;

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
      this.isOn = await this.client.getStatus(this.device.deviceId);
      this.service.updateCharacteristic(this.platform.Characteristic.On, this.isOn);
      this.platform.log.debug(`${this.device.name}: refreshed power=${this.isOn ? 'on' : 'off'}`);
    } catch (error) {
      this.platform.log.warn(`${this.device.name}: unable to refresh SwitchBot status: ${formatError(error)}`);
    }
  }

  private async setOn(value: CharacteristicValue): Promise<void> {
    const on = Boolean(value);
    try {
      await this.client.setPower(this.device.deviceId, on);
      this.isOn = on;
      this.service.updateCharacteristic(this.platform.Characteristic.On, on);
      await this.refreshStatus();
    } catch (error) {
      this.platform.log.error(`${this.device.name}: unable to set SwitchBot power: ${formatError(error)}`);
      throw error;
    }
  }

  private async getOn(): Promise<CharacteristicValue> {
    await this.refreshStatus();
    return this.isOn;
  }
}
