/**
 * @module commands/config
 * @description `anya config` — Interactive configuration manager.
 *
 * Menu-driven interface for all configurable sections:
 *   - Model: Switch provider + model (Gemini / OpenAI)
 *   - STT: Configure Groq Whisper for voice transcription
 *   - Telegram: Bot token + user ID
 *   - Show: Display current config with masked keys
 *
 * Each configSection is also callable standalone from `anya init`.
 */

import { select, input, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { writeFileSync } from 'node:fs';
import { loadConfig } from '../config/loader.js';
import { CONFIG_PATH, isInitialized } from '../lib/paths.js';
import type { AnyaConfig } from '../config/defaults.js';

// ── anya config (interactive menu) ───────────────────────────────────────────

export async function runConfigMenu(): Promise<void> {
  if (!isInitialized()) {
    console.log(chalk.yellow('~/.anya/ not initialized. Run "anya init" first.'));
    return;
  }

  const config = loadConfig();

  const section = await select({
    message: 'Configure',
    choices: [
      {
        name: `Model    ${chalk.dim(`(${config.provider.active}: ${getActiveModel(config)})`)}`,
        value: 'model',
      },
      {
        name: `STT      ${chalk.dim(`(Groq Whisper${config.stt?.groq_api_key ? chalk.green(' ✓') : chalk.yellow(' ✗')})`)}`,
        value: 'stt',
      },
      {
        name: `Vision   ${chalk.dim(`(Gemini${hasVisionKey(config) ? chalk.green(' ✓') : chalk.yellow(' ✗')})`)}`,
        value: 'vision',
      },
      {
        name: `TTS      ${chalk.dim(`(${config.tts?.voice || 'en-US-AriaNeural'})`)}`,
        value: 'tts',
      },
      {
        name: `Telegram ${chalk.dim(`(${config.telegram.enabled ? chalk.green('on') : 'off'})`)}`,
        value: 'telegram',
      },
      {
        name: chalk.dim('Show config'),
        value: 'show',
      },
      {
        name: chalk.dim('Cancel'),
        value: 'cancel',
      },
    ],
  });

  switch (section) {
    case 'model':
      await configModel(config);
      break;
    case 'stt':
      await configSTT(config);
      break;
    case 'vision':
      await configVision(config);
      break;
    case 'tts':
      await configTTS(config);
      break;
    case 'telegram':
      await configTelegram(config);
      break;
    case 'show':
      runConfigShow();
      break;
    case 'cancel':
      return;
  }
}

// ── Model configuration ──────────────────────────────────────────────────────

export async function configModel(config: AnyaConfig): Promise<void> {
  const { selectProvider } = await import('./providerSelect.js');
  await selectProvider(config);
  console.log(chalk.green('\n  [ok] Provider updated.'));
  await autoRestartGateway();
}

// ── STT configuration ────────────────────────────────────────────────────────

const STT_MODELS = [
  { name: 'whisper-large-v3-turbo' + chalk.dim(' (faster, recommended)'), value: 'whisper-large-v3-turbo' },
  { name: 'whisper-large-v3' + chalk.dim(' (more accurate, slower)'), value: 'whisper-large-v3' },
];

export async function configSTT(config: AnyaConfig): Promise<void> {
  // Ensure stt section exists
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
      // Just change model, keep existing key
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

    // action === 'full' → fall through to full setup below
  }

  // Full STT setup: API key + model
  console.log();
  console.log(chalk.dim('  Get a free key: https://console.groq.com/'));
  console.log(chalk.dim('  Used for: voice message transcription (Whisper)\n'));

  const apiKey = await input({
    message: 'Groq API Key:',
    default: config.stt.groq_api_key || undefined,
    validate: (v) => v.trim() ? true : 'API key is required for voice transcription',
  });

  config.stt.groq_api_key = apiKey.trim();

  // Model selection
  const model = await select({
    message: 'Whisper Model',
    choices: STT_MODELS,
    default: currentModel,
  });

  config.stt.model = model;

  // Save
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  console.log(chalk.green('\n  [ok] STT configured.'));
  console.log(chalk.dim(`  Provider: Groq Whisper`));
  console.log(chalk.dim(`  Model: ${model}`));
  await autoRestartGateway();
}

// ── Vision configuration ─────────────────────────────────────────────────────

const VISION_MODELS = [
  { name: 'Gemini 3 Flash Preview  (fast, recommended)', value: 'gemini-3-flash-preview' },
  { name: 'Gemini 3.1 Flash Lite Preview  (ultra fast)',  value: 'gemini-3.1-flash-lite-preview' },
  { name: 'Gemini 3.1 Pro Preview  (highest quality)',    value: 'gemini-3.1-pro-preview' },
];

function hasVisionKey(config: AnyaConfig): boolean {
  return !!(config.vision?.gemini_api_key || config.provider?.gemini?.api_key);
}

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

    // action === 'full' → fall through
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

// ── TTS configuration ────────────────────────────────────────────────────────

const EDGE_VOICES = [
  { name: 'Aria   (American female, natural)',   value: 'en-US-AriaNeural' },
  { name: 'Jenny  (American female, friendly)',  value: 'en-US-JennyNeural' },
  { name: 'Guy    (American male, casual)',      value: 'en-US-GuyNeural' },
  { name: '晓晓   (中文女声, 温柔)',               value: 'zh-CN-XiaoxiaoNeural' },
  { name: '七海   (日本語女性, やさしい)',           value: 'ja-JP-NanamiNeural' },
];

export async function configTTS(config: AnyaConfig): Promise<void> {
  if (!config.tts) {
    config.tts = { voice: 'en-US-AriaNeural', rate: '+0%', pitch: '+0Hz', volume: '+0%' };
  }

  const voice = await select({
    message: 'Voice',
    choices: EDGE_VOICES,
    default: config.tts.voice || 'en-US-AriaNeural',
  });
  config.tts.voice = voice;

  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  console.log(chalk.green('\n  [ok] TTS → Edge TTS'));
  console.log(chalk.dim(`  Voice: ${voice}`));

  await autoRestartGateway();
}


// ── Telegram configuration ───────────────────────────────────────────────────

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

// ── anya config show ─────────────────────────────────────────────────────────

export function runConfigShow(): void {
  if (!isInitialized()) {
    console.log(chalk.yellow('~/.anya/ not initialized. Run "anya init" first.'));
    return;
  }

  const config = loadConfig();

  // Deep clone and mask sensitive values
  const display = JSON.parse(JSON.stringify(config));

  if (display.provider?.gemini?.api_key) {
    display.provider.gemini.api_key = maskKey(display.provider.gemini.api_key);
  }
  if (display.tools?.web_search?.api_key) {
    display.tools.web_search.api_key = maskKey(display.tools.web_search.api_key);
  }
  if (display.telegram?.bot_token) {
    display.telegram.bot_token = maskKey(display.telegram.bot_token);
  }
  if (display.stt?.groq_api_key) {
    display.stt.groq_api_key = maskKey(display.stt.groq_api_key);
  }

  console.log(chalk.bold.cyan('\nAnya Configuration'));
  console.log(chalk.dim(`  ${CONFIG_PATH}\n`));
  console.log(JSON.stringify(display, null, 2));
  console.log();
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getActiveModel(config: AnyaConfig): string {
  return config.provider.active === 'openai'
    ? config.provider.openai.model
    : config.provider.gemini.model;
}

function maskKey(key: string): string {
  if (key.length <= 8) return '****';
  return key.substring(0, 4) + '****' + key.substring(key.length - 4);
}

async function autoRestartGateway(): Promise<void> {
  try {
    const { isServiceRunning } = await import('../lib/pidfile.js');
    const { running } = isServiceRunning('gateway');
    if (running) {
      console.log(chalk.dim('  Restarting gateway...'));
      const { runGatewayRestart } = await import('./gateway.js');
      await runGatewayRestart();
    }
  } catch {
    // Non-critical
  }
}
