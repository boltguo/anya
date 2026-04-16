/**
 * @module commands/config
 * @description `anya config` — Configuration manager.
 *
 * Config wizards:
 * - Gemini: API key for vision + image generation
 * - Azure: speech key for TTS + pronunciation assessment
 * - STT: Groq key for voice message transcription
 * - Tavily: API key for web search
 * - Telegram: bot token + allowed users
 */

import { select } from '@inquirer/prompts';
import chalk from 'chalk';
import { loadConfig } from '../../config/loader.js';
import { CONFIG_PATH, isInitialized } from '../../lib/paths.js';
import { configGemini } from './gemini.js';
import { configAzure } from './azure.js';
import { configSTT } from './stt.js';
import { configTavily } from './tavily.js';
import { configTelegram } from './telegram.js';
import { maskKey } from './helpers.js';

export { configGemini, configAzure, configSTT, configTavily, configTelegram };

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
          name: `Gemini   ${chalk.dim(`(Vision + ImageGen${config.gemini?.api_key ? chalk.green(' ✓') : chalk.yellow(' ✗')})`)}`,
          value: 'gemini',
        },
        {
          name: `Azure    ${chalk.dim(`(TTS + Pron${config.azure?.speech_key ? chalk.green(' ✓') : chalk.yellow(' ✗')})`)}`,
          value: 'azure',
        },
        {
          name: `STT      ${chalk.dim(`(Groq Whisper${config.stt?.groq_api_key ? chalk.green(' ✓') : chalk.yellow(' ✗')})`)}`,
          value: 'stt',
        },
        {
          name: `Tavily   ${chalk.dim(`(Web Search${config.tools?.web_search?.api_key ? chalk.green(' ✓') : chalk.yellow(' ✗')})`)}`,
          value: 'tavily',
        },
        {
          name: `Telegram ${chalk.dim(`(${config.telegram?.enabled ? chalk.green('on') : 'off'})`)}`,
          value: 'telegram',
        },
        {
          name: chalk.dim('Cancel'),
          value: 'cancel',
        },
      ],
    });

    switch (section) {
      case 'gemini': await configGemini(config); break;
      case 'azure': await configAzure(config); break;
      case 'stt': await configSTT(config); break;
      case 'tavily': await configTavily(config); break;
      case 'telegram': await configTelegram(config); break;
      case 'cancel': return;
    }
  } catch (err) {
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
  const display = JSON.parse(JSON.stringify(config));

  if (display.gemini?.api_key) display.gemini.api_key = maskKey(display.gemini.api_key);
  if (display.tools?.web_search?.api_key) display.tools.web_search.api_key = maskKey(display.tools.web_search.api_key);
  if (display.telegram?.bot_token) display.telegram.bot_token = maskKey(display.telegram.bot_token);
  if (display.stt?.groq_api_key) display.stt.groq_api_key = maskKey(display.stt.groq_api_key);
  if (display.azure?.speech_key) display.azure.speech_key = maskKey(display.azure.speech_key);

  console.log(chalk.bold.cyan('\nAnya Configuration'));
  console.log(chalk.dim(`  ${CONFIG_PATH}\n`));
  console.log(JSON.stringify(display, null, 2));
  console.log();
}
