/**
 * @module commands/config/tavily
 * @description Tavily API key for web search.
 */

import { input } from '@inquirer/prompts';
import chalk from 'chalk';
import { writeFileSync } from 'node:fs';
import { CONFIG_PATH } from '../../lib/paths.js';
import type { AnyaConfig } from '../../config/defaults.js';
import { autoRestartGateway } from './helpers.js';

export async function configTavily(config: AnyaConfig): Promise<void> {
  const current = config.tools?.web_search?.api_key;
  if (current) console.log(chalk.dim(`\n  Current key: ${current.substring(0, 6)}****`));
  console.log(chalk.dim('  Get a key: https://tavily.com/\n'));

  const apiKey = await input({
    message: 'Tavily API Key:',
    default: current || undefined,
  });

  if (!apiKey.trim()) { console.log(chalk.yellow('  Cancelled.')); return; }

  config.tools.web_search.api_key = apiKey.trim();
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  console.log(chalk.green('\n  [ok] Tavily API key saved.'));
  await autoRestartGateway();
}
