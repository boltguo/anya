/**
 * @module commands/config/stt
 * @description Groq API key for speech-to-text (Whisper).
 */

import { input } from '@inquirer/prompts';
import chalk from 'chalk';
import { writeFileSync } from 'node:fs';
import { CONFIG_PATH } from '../../lib/paths.js';
import type { AnyaConfig } from '../../config/defaults.js';
import { autoRestartGateway } from './helpers.js';

export async function configSTT(config: AnyaConfig): Promise<void> {
  const current = config.stt?.groq_api_key;
  if (current) console.log(chalk.dim(`\n  Current key: ${current.substring(0, 6)}****`));
  console.log(chalk.dim('  Get a free key: https://console.groq.com/\n'));

  const apiKey = await input({
    message: 'Groq API Key:',
    default: current || undefined,
  });

  if (!apiKey.trim()) { console.log(chalk.yellow('  Cancelled.')); return; }

  config.stt.groq_api_key = apiKey.trim();
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  console.log(chalk.green('\n  [ok] Groq STT key saved.'));
  await autoRestartGateway();
}
