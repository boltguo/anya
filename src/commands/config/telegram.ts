/**
 * @module commands/config/telegram
 * @description Telegram bot configuration wizard.
 *
 * Configures bot token, allowed user IDs (access control), and
 * the enabled/disabled state of the Telegram integration.
 */

import { input, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { writeFileSync } from 'node:fs';
import { CONFIG_PATH } from '../../lib/paths.js';
import type { AnyaConfig } from '../../config/defaults.js';
import { maskKey, autoRestartGateway } from './helpers.js';

export async function configTelegram(config: AnyaConfig): Promise<void> {
  if (config.telegram.enabled && config.telegram.bot_token) {
    console.log(chalk.dim(`\n  Bot token: ${maskKey(config.telegram.bot_token)}`));
    console.log(chalk.dim(`  Allowed users: ${config.telegram.allowed_user_ids.join(', ') || 'all'}`));

    const update = await confirm({
      message: 'Update Telegram settings?',
      default: false,
    });
    if (!update) return;
  }

  const botToken = await input({
    message: 'Telegram Bot Token (from @BotFather):',
    default: config.telegram.bot_token || undefined,
  });

  if (botToken.trim()) {
    config.telegram.enabled = true;
    config.telegram.bot_token = botToken.trim();

    const userId = await input({
      message: 'Your Telegram User ID (numeric, press Enter to allow all):',
      default: config.telegram.allowed_user_ids[0]?.toString() || undefined,
    });

    if (userId.trim()) {
      config.telegram.allowed_user_ids = [parseInt(userId.trim(), 10)];
    }
  }

  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  console.log(chalk.green('\n  [ok] Telegram configured.'));
  await autoRestartGateway();
}
