import type { API } from 'homebridge';

import { SwitchBotSimplePlatform } from './platform.js';
import { PLATFORM_NAME } from './settings.js';

export default (api: API): void => {
  api.registerPlatform(PLATFORM_NAME, SwitchBotSimplePlatform);
  api.registerPlatform('SwitchBotCurtain3', SwitchBotSimplePlatform);
};
