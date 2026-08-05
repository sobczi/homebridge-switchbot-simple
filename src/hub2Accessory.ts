import type { PlatformAccessory, Service } from 'homebridge';

import type { SwitchBotDeviceConfig, SwitchBotSimplePlatform } from './platform.js';
import type { SwitchBotClient } from './switchbotApi.js';

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class SwitchBotHub2Accessory {
  private readonly temperatureService: Service;
  private readonly humidityService: Service;
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
      .setCharacteristic(this.platform.Characteristic.Model, 'Hub 2 (OpenAPI)')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.device.deviceId);

    this.temperatureService = accessory.getService(this.platform.Service.TemperatureSensor)
      ?? accessory.addService(this.platform.Service.TemperatureSensor, `${this.device.name} Temperature`);
    this.temperatureService.setCharacteristic(this.platform.Characteristic.Name, `${this.device.name} Temperature`);
    this.temperatureService.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .onGet(this.getTemperature.bind(this));

    this.humidityService = accessory.getService(this.platform.Service.HumiditySensor)
      ?? accessory.addService(this.platform.Service.HumiditySensor, `${this.device.name} Humidity`);
    this.humidityService.setCharacteristic(this.platform.Characteristic.Name, `${this.device.name} Humidity`);
    this.humidityService.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
      .onGet(this.getHumidity.bind(this));

    this.poller = setInterval(() => void this.refreshStatus(), this.platform.refreshInterval * 1000);
    this.poller.unref();
    void this.refreshStatus();
  }

  async refreshStatus(): Promise<void> {
    try {
      const status = await this.client.getHub2Status(this.device.deviceId);
      this.temperatureService.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, status.temperature);
      this.humidityService.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, status.humidity);
      this.platform.log.debug(`${this.device.name}: refreshed temperature=${status.temperature}C humidity=${status.humidity}%`);
    } catch (error) {
      this.platform.log.warn(`${this.device.name}: unable to refresh Hub 2 status: ${formatError(error)}`);
    }
  }

  private async getTemperature(): Promise<number> {
    const status = await this.client.getHub2Status(this.device.deviceId);
    return status.temperature;
  }

  private async getHumidity(): Promise<number> {
    const status = await this.client.getHub2Status(this.device.deviceId);
    return status.humidity;
  }
}
