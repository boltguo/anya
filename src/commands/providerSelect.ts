/**
 * @module commands/providerSelect
 * @description Shared provider selection UI for `anya init` and `anya model`.
 *
 * Shows an interactive prompt to choose between Gemini and OpenAI,
 * then handles provider-specific authentication.
 *
 * Smart detection: if credentials already exist for the selected provider,
 * asks whether to re-authenticate or keep existing credentials.
 */

import { select, input, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { writeFileSync } from 'node:fs';
import { CONFIG_PATH } from '../lib/paths.js';
import type { AnyaConfig } from '../config/defaults.js';

/**
 * Run the provider selection flow.
 *
 * - Gemini: prompts for API key (skips if already configured)
 * - OpenAI: runs the device code OAuth flow (skips if already authenticated)
 *
 * Updates config in-place and writes to disk.
 *
 * @param config - The config object to update (mutated in place).
 */
export async function selectProvider(config: AnyaConfig): Promise<void> {
  const currentProvider = config.provider.active;

  // Detect existing credentials for display
  const hasGeminiKey = !!config.provider.gemini.api_key;
  const { hasCodexAuth } = await import('../lib/auth.js');
  const hasOpenAIAuth = hasCodexAuth();

  const provider = await select({
    message: 'Model Provider',
    choices: [
      {
        name: `Gemini (Google AI Studio)` +
          (hasGeminiKey ? chalk.green(' ✓') : '') +
          (currentProvider === 'gemini' ? chalk.dim(' ← active') : ''),
        value: 'gemini',
      },
      {
        name: `OpenAI (ChatGPT / Codex)` +
          (hasOpenAIAuth ? chalk.green(' ✓') : '') +
          (currentProvider === 'openai' ? chalk.dim(' ← active') : ''),
        value: 'openai',
      },
    ],
    default: currentProvider,
  });

  config.provider.active = provider;

  if (provider === 'gemini') {
    if (hasGeminiKey) {
      // Already has key — ask if they want to update
      const maskedKey = config.provider.gemini.api_key.substring(0, 6) + '****';
      console.log(chalk.dim(`\n  API key found: ${maskedKey}`));

      const update = await confirm({
        message: 'Update API key?',
        default: false,
      });

      if (update) {
        await promptGeminiKey(config);
      }
    } else {
      // No key — must enter one
      await promptGeminiKey(config);
    }

    console.log(chalk.dim(`  Model: ${config.provider.gemini.model}`));

  } else if (provider === 'openai') {
    if (hasOpenAIAuth) {
      // Already authenticated
      console.log(chalk.dim('\n  OpenAI: already authenticated ✓'));

      const reauth = await confirm({
        message: 'Re-authenticate?',
        default: false,
      });

      if (reauth) {
        await runCodexLogin(config);
      }
    } else {
      // Not authenticated — must login
      await runCodexLogin(config);
    }

    console.log(chalk.dim(`  Model: ${config.provider.openai.model}`));
  }

  // Save updated config
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

/**
 * Prompt user for Gemini API key.
 */
async function promptGeminiKey(config: AnyaConfig): Promise<void> {
  console.log();
  console.log(chalk.dim('   Get a free key: https://aistudio.google.com/\n'));

  const apiKey = await input({
    message: 'Gemini API Key:',
    default: config.provider.gemini.api_key || undefined,
    validate: (value) => {
      if (!value.trim()) return 'API key is required';
      return true;
    },
  });

  config.provider.gemini.api_key = apiKey.trim();
}

/**
 * Run OpenAI device code login flow, with fallback to Gemini on failure.
 */
async function runCodexLogin(config: AnyaConfig): Promise<void> {
  const { codexDeviceLogin } = await import('../lib/auth.js');

  try {
    await codexDeviceLogin();
  } catch (err) {
    console.error(chalk.red(`\n  Authentication failed: ${(err as Error).message}`));
    console.log(chalk.yellow('  Falling back to Gemini.\n'));
    config.provider.active = 'gemini';
  }
}
