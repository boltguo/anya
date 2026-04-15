/**
 * @module commands/config/stt
 * @description STT (Speech-to-Text) configuration wizard.
 *
 * Configures the Groq Whisper API key and model selection for
 * voice message transcription on Telegram.
 */

import { select, input } from '@inquirer/prompts';
import chalk from 'chalk';
import { writeFileSync } from 'node:fs';
import { CONFIG_PATH } from '../../lib/paths.js';
import type { AnyaConfig } from '../../config/defaults.js';
import { maskKey, autoRestartGateway } from './helpers.js';

const STT_MODELS = [
  { name: 'whisper-large-v3-turbo' + chalk.dim(' (faster, recommended)'), value: 'whisper-large-v3-turbo' },
  { name: 'whisper-large-v3' + chalk.dim(' (more accurate, slower)'), value: 'whisper-large-v3' },
];

export async function configSTT(config: AnyaConfig): Promise<void> {
  if (!config.stt) {
    (config as any).stt = { groq_api_key: '', model: 'whisper-large-v3-turbo' };
  }

  const hasKey = !!config.stt.groq_api_key;
  const currentModel = config.stt.model || 'whisper-large-v3-turbo';

  if (hasKey) {
    const maskedKey = maskKey(config.stt.groq_api_key);
    console.log(chalk.dim(`\n  Groq API Key: ${maskedKey}`));
    console.log(chalk.dim(`  Model: ${currentModel}`));

    const action = await select({
      message: 'STT Settings',
      choices: [
        { name: 'Change Whisper model', value: 'model' },
        { name: 'Update API key + model', value: 'full' },
        { name: chalk.dim('Cancel'), value: 'cancel' },
      ],
    });

    if (action === 'cancel') return;

    if (action === 'model') {
      const model = await select({
        message: 'Whisper Model',
        choices: STT_MODELS,
        default: currentModel,
      });
      config.stt.model = model;
      writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
      console.log(chalk.green(`\n  [ok] STT model → ${model}`));
      await autoRestartGateway();
      return;
    }
    // action === 'full' falls through
  }

  console.log();
  console.log(chalk.dim('  Get a free key: https://console.groq.com/'));
  console.log(chalk.dim('  Used for: voice message transcription (Whisper)\n'));

  const apiKey = await input({
    message: 'Groq API Key:',
    default: config.stt.groq_api_key || undefined,
    validate: (v) => v.trim() ? true : 'API key is required for voice transcription',
  });

  config.stt.groq_api_key = apiKey.trim();

  const model = await select({
    message: 'Whisper Model',
    choices: STT_MODELS,
    default: currentModel,
  });

  config.stt.model = model;

  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  console.log(chalk.green('\n  [ok] STT configured.'));
  console.log(chalk.dim(`  Provider: Groq Whisper`));
  console.log(chalk.dim(`  Model: ${model}`));
  await autoRestartGateway();
}
