/**
 * @module commands/config
 * @description Public entry for `anya config` — implementation split by section
 * under `src/commands/config/`.
 */

export {
  runConfigMenu,
  runConfigShow,
  configModel,
  configSTT,
  configVision,
  configTTS,
  configTelegram,
} from './config/index.js';
