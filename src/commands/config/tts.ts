/**
 * @module commands/config/tts
 * @description TTS (Text-to-Speech) configuration wizard.
 *
 * Configures the default voice and speaking rate for Microsoft Edge TTS,
 * used to generate voice messages on Telegram.
 */

import { select } from '@inquirer/prompts';
import chalk from 'chalk';
import { writeFileSync } from 'node:fs';
import { CONFIG_PATH } from '../../lib/paths.js';
import type { AnyaConfig } from '../../config/defaults.js';
import { autoRestartGateway } from './helpers.js';

const EDGE_VOICES = [
  { name: 'Aria   (American female, natural)',   value: 'en-US-AriaNeural' },
  { name: 'Jenny  (American female, friendly)',  value: 'en-US-JennyNeural' },
  { name: 'Guy    (American male, casual)',      value: 'en-US-GuyNeural' },
  { name: '晓晓   (中文女声, 温柔)',               value: 'zh-CN-XiaoxiaoNeural' },
  { name: '七海   (日本語女性, やさしい)',           value: 'ja-JP-NanamiNeural' },
];

export async function configTTS(config: AnyaConfig): Promise<void> {
  if (!config.tts) {
    config.tts = { voice: 'en-US-AriaNeural', rate: '+0%' };
  }

  const voice = await select({
    message: 'Voice',
    choices: EDGE_VOICES,
    default: config.tts.voice || 'en-US-AriaNeural',
  });
  config.tts.voice = voice;

  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  console.log(chalk.green('\n  [ok] TTS → Edge TTS'));
  console.log(chalk.dim(`  Voice: ${voice}`));

  await autoRestartGateway();
}
