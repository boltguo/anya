/**
 * @module commands/config
 * @description `anya config` — Interactive configuration manager.
 *
 * Top-level router for menu/show commands. Per-section logic lives in sibling
 * files and is also re-exported so callers (e.g. `anya init`) can import a
 * single section standalone.
 */

import { select } from '@inquirer/prompts';
import chalk from 'chalk';
import { loadConfig } from '../../config/loader.js';
import { CONFIG_PATH, isInitialized } from '../../lib/paths.js';

import { configModel } from './model.js';
import { configSTT } from './stt.js';
import { configVision } from './vision.js';
import { configTTS } from './tts.js';
import { configTelegram } from './telegram.js';
import { configImageGen } from './imageGen.js';
import { configAzure } from './azure.js';
import { getActiveModel, hasVisionKey, maskKey } from './helpers.js';

export { configModel, configSTT, configVision, configTTS, configTelegram, configImageGen, configAzure };

export async function runConfigMenu(): Promise<void> {
  if (!isInitialized()) {
    console.log(chalk.yellow('~/.anya/ not initialized. Run "anya init" first.'));
    return;
  }

  try {
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
          name: `ImageGen ${chalk.dim(`(${config.image_gen?.backend || 'vertex'}${config.vertex?.project ? chalk.green(' ✓') : chalk.yellow(' ✗')})`)}`,
          value: 'image_gen',
        },
        {
          name: `Azure    ${chalk.dim(`(Speech${config.azure?.speech_key ? chalk.green(' ✓') : chalk.yellow(' ✗')})`)}`,
          value: 'azure',
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
      case 'image_gen':
        await configImageGen(config);
        break;
      case 'azure':
        await configAzure(config);
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
  } catch (err) {
    // Gracefully handle Ctrl+C (SIGINT) — just exit silently
    if ((err as Error)?.name === 'ExitPromptError') {
      console.log(chalk.dim('\n  Cancelled.'));
      return;
    }
    throw err;
  }
}

export function runConfigShow(): void {
  if (!isInitialized()) {
    console.log(chalk.yellow('~/.anya/ not initialized. Run "anya init" first.'));
    return;
  }

  const config = loadConfig();

  // Deep clone and mask sensitive values.
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
  if (display.azure?.speech_key) {
    display.azure.speech_key = maskKey(display.azure.speech_key);
  }

  console.log(chalk.bold.cyan('\nAnya Configuration'));
  console.log(chalk.dim(`  ${CONFIG_PATH}\n`));
  console.log(JSON.stringify(display, null, 2));
  console.log();
}
