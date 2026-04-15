/**
 * @module commands/config/vision
 * @description Vision (image analysis) configuration wizard.
 *
 * Configures the model for analyzing photos sent via Telegram.
 * Uses the global Gemini API key — no separate key needed.
 */

import { select } from '@inquirer/prompts';
import chalk from 'chalk';
import { writeFileSync } from 'node:fs';
import { CONFIG_PATH } from '../../lib/paths.js';
import type { AnyaConfig } from '../../config/defaults.js';
import { autoRestartGateway } from './helpers.js';

const VISION_MODELS = [
  { name: 'Gemini 3 Flash Preview  (fast, recommended)', value: 'gemini-3-flash-preview' },
  { name: 'Gemini 3.1 Flash Lite Preview  (ultra fast)',  value: 'gemini-3.1-flash-lite-preview' },
  { name: 'Gemini 3.1 Pro Preview  (highest quality)',    value: 'gemini-3.1-pro-preview' },
];

export async function configVision(config: AnyaConfig): Promise<void> {
  const currentModel = config.vision?.model || 'gemini-3-flash-preview';

  console.log(chalk.dim(`\n  Uses global Gemini API key for vision.`));
  console.log(chalk.dim(`  Current model: ${currentModel}\n`));

  const model = await select({
    message: 'Vision Model',
    choices: VISION_MODELS,
    default: currentModel,
  });

  config.vision = { model };
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  console.log(chalk.green(`\n  [ok] Vision model → ${model}`));
  await autoRestartGateway();
}
