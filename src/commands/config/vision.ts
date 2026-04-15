/**
 * @module commands/config/vision
 * @description Vision (image analysis) configuration wizard.
 *
 * Configures the Gemini API key and model for analyzing photos sent
 * via Telegram. Falls back to the main Gemini key if not set separately.
 */

import { select, input } from '@inquirer/prompts';
import chalk from 'chalk';
import { writeFileSync } from 'node:fs';
import { CONFIG_PATH } from '../../lib/paths.js';
import type { AnyaConfig } from '../../config/defaults.js';
import { maskKey, autoRestartGateway } from './helpers.js';

const VISION_MODELS = [
  { name: 'Gemini 3 Flash Preview  (fast, recommended)', value: 'gemini-3-flash-preview' },
  { name: 'Gemini 3.1 Flash Lite Preview  (ultra fast)',  value: 'gemini-3.1-flash-lite-preview' },
  { name: 'Gemini 3.1 Pro Preview  (highest quality)',    value: 'gemini-3.1-pro-preview' },
];

export async function configVision(config: AnyaConfig): Promise<void> {
  if (!config.vision) {
    config.vision = { gemini_api_key: '', model: 'gemini-3-flash-preview' };
  }

  const currentKey = config.vision.gemini_api_key || config.provider?.gemini?.api_key || '';
  const currentModel = config.vision.model || 'gemini-3-flash-preview';
  const isUsingFallback = !config.vision.gemini_api_key && !!config.provider?.gemini?.api_key;

  if (currentKey) {
    console.log(chalk.dim(`\n  API Key: ${maskKey(currentKey)}${isUsingFallback ? ' (from model config)' : ''}`));
    console.log(chalk.dim(`  Model: ${currentModel}`));

    const action = await select({
      message: 'Vision settings',
      choices: [
        { name: 'Change model only', value: 'model' },
        { name: 'Full setup (key + model)', value: 'full' },
        { name: 'Cancel', value: 'cancel' },
      ],
    });

    if (action === 'cancel') return;

    if (action === 'model') {
      const model = await select({
        message: 'Vision Model',
        choices: VISION_MODELS,
        default: currentModel,
      });
      config.vision.model = model;
      writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
      console.log(chalk.green(`\n  [ok] Vision model → ${model}`));
      await autoRestartGateway();
      return;
    }
    // action === 'full' falls through
  }

  console.log();
  console.log(chalk.dim('  Get a free key: https://aistudio.google.com/apikey'));
  console.log(chalk.dim('  Used for: image understanding (Telegram photos)'));
  console.log(chalk.dim('  Leave blank to use the Gemini key from model config\n'));

  const apiKey = await input({
    message: 'Gemini API Key (Vision):',
    default: config.vision.gemini_api_key || undefined,
  });

  config.vision.gemini_api_key = apiKey.trim();

  const model = await select({
    message: 'Vision Model',
    choices: VISION_MODELS,
    default: currentModel,
  });

  config.vision.model = model;

  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  console.log(chalk.green('\n  [ok] Vision configured.'));
  console.log(chalk.dim(`  Model: ${model}`));
  if (!config.vision.gemini_api_key && config.provider?.gemini?.api_key) {
    console.log(chalk.dim('  Using Gemini key from model config'));
  }
  await autoRestartGateway();
}
