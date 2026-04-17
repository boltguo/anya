/**
 * @module commands/config/llm
 * @description LLM (OpenAI Codex) authentication wizard.
 *
 * Handles the OAuth device code login flow and clearing stored credentials.
 * The LLM itself is OpenAI Codex — API keys are not used, only OAuth tokens.
 */

import { select } from '@inquirer/prompts';
import chalk from 'chalk';
import type { AnyaConfig } from '../../config/defaults.js';
import { codexDeviceLogin, hasCodexAuth } from '../../lib/auth.js';
import { autoRestartGateway } from './helpers.js';

export async function configLLM(config: AnyaConfig): Promise<void> {
  const authed = hasCodexAuth();

  console.log();
  console.log(chalk.dim(`  Provider: OpenAI Codex (${config.provider.model})`));
  console.log(chalk.dim(`  Status:   ${authed ? chalk.green('authenticated') : chalk.yellow('not authenticated')}\n`));

  const action = await select({
    message: 'OpenAI Codex',
    choices: [
      { name: authed ? 'Re-authenticate (device code)' : 'Sign in with OpenAI (device code)', value: 'login' },
      { name: chalk.dim('Cancel'), value: 'cancel' },
    ],
  });

  if (action === 'cancel') return;

  try {
    await codexDeviceLogin();
    await autoRestartGateway();
  } catch (err) {
    console.log(chalk.red(`\n  [error] ${(err as Error).message}`));
  }
}
