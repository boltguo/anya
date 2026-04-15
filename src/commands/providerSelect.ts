/**
 * @module commands/providerSelect
 * @description Shared provider selection UI for `anya init` and `anya config`.
 *
 * Flow: Choose provider → Authenticate → Select model
 *
 * Smart detection: if credentials already exist for the selected provider,
 * asks whether to re-authenticate or keep existing credentials.
 */

import { select, input, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { writeFileSync } from 'node:fs';
import { CONFIG_PATH } from '../lib/paths.js';
import type { AnyaConfig } from '../config/defaults.js';

// ── Model lists ──────────────────────────────────────────────────────────────

const OPENAI_MODELS = [
  { name: 'gpt-5.4' + chalk.dim(' (flagship)'), value: 'gpt-5.4' },
  { name: 'gpt-5.4-mini' + chalk.dim(' (faster, cheaper)'), value: 'gpt-5.4-mini' },
];

const GEMINI_MODELS = [
  { name: 'gemini-3.1-pro-preview' + chalk.dim(' (most capable)'), value: 'gemini-3.1-pro-preview' },
  { name: 'gemini-3-flash-preview' + chalk.dim(' (fast, recommended)'), value: 'gemini-3-flash-preview' },
  { name: 'gemini-3.1-flash-lite-preview' + chalk.dim(' (lightest)'), value: 'gemini-3.1-flash-lite-preview' },
  { name: 'gemma-4-31b-it' + chalk.dim(' (open model)'), value: 'gemma-4-31b-it' },
];

// ── Provider selection flow ──────────────────────────────────────────────────

/**
 * Run the provider selection flow.
 *
 * - Choose provider (Gemini / OpenAI)
 * - Authenticate (API key / OAuth)
 * - Select model
 *
 * Updates config in-place and writes to disk.
 */
export async function selectProvider(config: AnyaConfig): Promise<void> {
  const currentProvider = config.provider.active;

  // Detect existing credentials for display
  const hasGeminiKey = !!config.provider.gemini.api_key;
  const { hasCodexAuth } = await import('../lib/auth.js');
  const hasOpenAIAuth = hasCodexAuth();

  const provider = await select<'gemini' | 'openai'>({
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

    // Model selection
    const geminiModel = await select({
      message: 'Gemini Model',
      choices: GEMINI_MODELS,
      default: config.provider.gemini.model || 'gemini-3-flash-preview',
    });
    config.provider.gemini.model = geminiModel;
    console.log(chalk.dim(`  Model: ${geminiModel}`));

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

    // Model selection
    const openaiModel = await select({
      message: 'OpenAI Model',
      choices: OPENAI_MODELS,
      default: config.provider.openai.model || 'gpt-5.4',
    });
    config.provider.openai.model = openaiModel;
    console.log(chalk.dim(`  Model: ${openaiModel}`));
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
