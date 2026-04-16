/**
 * @module commands/config/gemini
 * @description Gemini API key configuration for vision + image generation.
 */

import { input } from '@inquirer/prompts';
import chalk from 'chalk';
import { writeFileSync } from 'node:fs';
import { CONFIG_PATH } from '../../lib/paths.js';
import type { AnyaConfig } from '../../config/defaults.js';
import { autoRestartGateway } from './helpers.js';

export async function configGemini(config: AnyaConfig): Promise<void> {
  const current = config.gemini?.api_key;
  if (current) {
    console.log(chalk.dim(`\n  Current key: ${current.substring(0, 6)}****`));
  }
  console.log(chalk.dim('  Get a key: https://aistudio.google.com/\n'));

  const apiKey = await input({
    message: 'Gemini API Key:',
    default: current || undefined,
  });

  if (!apiKey.trim()) {
    console.log(chalk.yellow('  Cancelled.'));
    return;
  }

  config.gemini = { ...config.gemini, api_key: apiKey.trim() };
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');

  console.log(chalk.green('\n  [ok] Gemini API key saved.'));
  console.log(chalk.dim(`  Vision:    ${config.gemini.vision_model}`));
  console.log(chalk.dim(`  Image Gen: ${config.gemini.image_model}`));
  await autoRestartGateway();
}
