import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';

import type { SwitchBotDeviceConfig, SwitchBotSimplePlatform } from './platform.js';
import type { CurtainStatus, SwitchBotClient } from './switchbotApi.js';

export const fromSwitchBotPosition = (position: number): number => 100 - position;
export const toSwitchBotPosition = (position: number): number => 100 - position;

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class SwitchBotCurtainAccessory {
  private readonly service: Service;
  private readonly poller: NodeJS.Timeout;
  private readonly device: SwitchBotDeviceConfig;
  private currentPosition = 0;
  private targetPosition = 0;

  constructor(
    private readonly platform: SwitchBotSimplePlatform,
    private readonly accessory: PlatformAccessory,
    private readonly client: SwitchBotClient,
  ) {
    this.device = accessory.context.device as SwitchBotDeviceConfig;
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'SwitchBot')
      .setCharacteristic(this.platform.Characteristic.Model, 'Curtain 3 (OpenAPI)')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.device.deviceId);

    this.service = accessory.getService(this.platform.Service.WindowCovering)
      ?? accessory.addService(this.platform.Service.WindowCovering, this.device.name);
    this.service.setCharacteristic(this.platform.Characteristic.Name, this.device.name);
    this.service.getCharacteristic(this.platform.Characteristic.CurrentPosition)
      .onGet(this.getCurrentPosition.bind(this));
    this.service.getCharacteristic(this.platform.Characteristic.TargetPosition)
      .onGet(() => this.targetPosition)
      .onSet(this.setTargetPosition.bind(this));
    this.service.getCharacteristic(this.platform.Characteristic.PositionState)
      .onGet(() => this.positionState());
    this.service.getCharacteristic(this.platform.Characteristic.HoldPosition)
      .onSet(this.holdPosition.bind(this));

    this.poller = setInterval(() => void this.refreshStatus(), this.platform.refreshInterval * 1000);
    this.poller.unref();
    void this.refreshStatus();
  }

  async refreshStatus(): Promise<void> {
    try {
      const status = await this.client.getCurtainStatus(this.device.deviceId);
      this.updateFromStatus(status);
    } catch (error) {
      this.platform.log.warn(`${this.device.name}: unable to refresh Curtain 3 status: ${formatError(error)}`);
    }
  }

  private updateFromStatus(status: CurtainStatus): void {
    this.currentPosition = fromSwitchBotPosition(status.slidePosition);
    if (!status.moving) {
      this.targetPosition = this.currentPosition;
    }
    this.service.updateCharacteristic(this.platform.Characteristic.CurrentPosition, this.currentPosition);
    this.service.updateCharacteristic(this.platform.Characteristic.TargetPosition, this.targetPosition);
    this.service.updateCharacteristic(this.platform.Characteristic.PositionState, this.positionState(status.moving));
    this.platform.log.debug(`${this.device.name}: refreshed position=${this.currentPosition}, moving=${status.moving}`);
  }

  private async getCurrentPosition(): Promise<CharacteristicValue> {
    await this.refreshStatus();
    return this.currentPosition;
  }

  private async setTargetPosition(value: CharacteristicValue): Promise<void> {
    const target = Math.round(Math.max(0, Math.min(100, Number(value))));
    const previous = this.currentPosition;
    this.targetPosition = target;
    this.service.updateCharacteristic(this.platform.Characteristic.TargetPosition, target);
    this.service.updateCharacteristic(this.platform.Characteristic.PositionState, this.positionState(true, previous));

    try {
      await this.client.setCurtainPosition(this.device.deviceId, toSwitchBotPosition(target));
      this.platform.log.info(`${this.device.name}: requested position=${target}`);
      const refresh = setTimeout(() => void this.refreshStatus(), 2000);
      refresh.unref();
    } catch (error) {
      this.targetPosition = previous;
      this.service.updateCharacteristic(this.platform.Characteristic.TargetPosition, previous);
      this.service.updateCharacteristic(this.platform.Characteristic.PositionState, this.platform.Characteristic.PositionState.STOPPED);
      this.platform.log.error(`${this.device.name}: unable to set Curtain 3 position: ${formatError(error)}`);
      throw error;
    }
  }

  private async holdPosition(value: CharacteristicValue): Promise<void> {
    if (!value) {
      return;
    }
    try {
      await this.client.pauseCurtain(this.device.deviceId);
      await this.refreshStatus();
      this.platform.log.info(`${this.device.name}: pause requested`);
    } catch (error) {
      this.platform.log.error(`${this.device.name}: unable to pause Curtain 3: ${formatError(error)}`);
      throw error;
    }
  }

  private positionState(moving = this.targetPosition !== this.currentPosition, current = this.currentPosition): number {
    if (!moving || this.targetPosition === current) {
      return this.platform.Characteristic.PositionState.STOPPED;
    }
    return this.targetPosition > current
      ? this.platform.Characteristic.PositionState.INCREASING
      : this.platform.Characteristic.PositionState.DECREASING;
  }
}
