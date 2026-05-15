// commands/config.ts — interactive config wizards

import { select, input, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { writeFileSync } from 'node:fs';
import { loadConfig } from '../config/loader.js';
import { CONFIG_PATH, isInitialized } from '../lib/paths.js';
import type { AnyaConfig } from '../config/defaults.js';
import { hasCodexAuth } from '../lib/auth.js';

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
    // non-critical
  }
}

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
          name: `ChatGPT    ${chalk.dim(`(Codex OAuth${hasCodexAuth() ? chalk.green(' ✓') : chalk.yellow(' ✗')})`)}`,
          value: 'openai',
        },
        {
          name: `Gemini     ${chalk.dim(`(Image Vision${config.gemini?.api_key ? chalk.green(' ✓') : chalk.yellow(' ✗')})`)}`,
          value: 'gemini',
        },
        {
          name: `Azure      ${chalk.dim(`(TTS + Pron${config.azure?.speech_key ? chalk.green(' ✓') : chalk.yellow(' ✗')})`)}`,
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
          name: `Cron     ${chalk.dim(`(${config.cron?.enabled ? chalk.green('on') : 'off'})`)}`,
          value: 'cron',
        },
        {
          name: chalk.dim('Cancel'),
          value: 'cancel',
        },
      ],
    });

    switch (section) {
      case 'gemini': await configGemini(config); break;
      case 'openai': await configOpenAI(config); break;
      case 'azure': await configAzure(config); break;
      case 'stt': await configSTT(config); break;
      case 'tavily': await configTavily(config); break;
      case 'telegram': await configTelegram(config); break;
      case 'cron': await configCron(config); break;
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

async function configGemini(config: AnyaConfig): Promise<void> {
  const currentKey = config.gemini?.api_key;
  
  console.log();
  console.log(chalk.dim(`  Provider: Gemini (Vision Only)`));
  console.log(chalk.dim(`  Model:    ${config.gemini.vision_model}`));
  if (currentKey) {
    console.log(chalk.dim(`  API Key:  ${currentKey.substring(0, 6)}****`));
  } else {
    console.log(chalk.dim(`  API Key:  ${chalk.yellow('not set')}`));
    console.log(chalk.dim('  Get a key: https://aistudio.google.com/'));
  }
  console.log();

  const apiKey = await input({
    message: 'Gemini API Key:',
    default: currentKey || undefined,
  });

  if (!apiKey.trim()) {
    console.log(chalk.yellow('  Cancelled.'));
    return;
  }

  config.gemini = { ...config.gemini, api_key: apiKey.trim() };

  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');

  console.log(chalk.green(`\n  [ok] Gemini configuration saved.`));
  await autoRestartGateway();
}

async function configAzure(config: AnyaConfig): Promise<void> {
  const currentKey = config.azure?.speech_key || '';
  const currentRegion = config.azure?.speech_region || 'eastasia';

  console.log();
  console.log(chalk.dim('  Azure Speech is used for TTS and pronunciation assessment.'));
  if (currentKey) {
    console.log(chalk.dim(`  Current Key: ${maskKey(currentKey)}`));
    console.log(chalk.dim(`  Region:      ${currentRegion}`));
  } else {
    console.log(chalk.dim('  Get a key: https://portal.azure.com/ → Speech Services'));
  }
  console.log();

  const speechKey = await input({
    message: 'Azure Speech Key:',
    default: currentKey || undefined,
  });

  if (!speechKey.trim()) {
    console.log(chalk.yellow('\n  Cancelled.'));
    return;
  }

  config.azure = { 
    speech_key: speechKey.trim(), 
    speech_region: currentRegion 
  };
  
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');

  console.log(chalk.green('\n  [ok] Azure Speech key configured.'));
  await autoRestartGateway();
}

async function configSTT(config: AnyaConfig): Promise<void> {
  const currentKey = config.stt?.groq_api_key;
  
  console.log();
  if (currentKey) {
    console.log(chalk.dim(`  Current Key: ${currentKey.substring(0, 6)}****`));
  } else {
    console.log(chalk.dim('  Get a free key: https://console.groq.com/'));
  }
  console.log();

  const apiKey = await input({
    message: 'Groq API Key:',
    default: currentKey || undefined,
  });

  if (!apiKey.trim()) { 
    console.log(chalk.yellow('\n  Cancelled.')); 
    return; 
  }

  config.stt.groq_api_key = apiKey.trim();
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  console.log(chalk.green('\n  [ok] Groq STT key saved.'));
  await autoRestartGateway();
}

async function configTavily(config: AnyaConfig): Promise<void> {
  const currentKey = config.tools?.web_search?.api_key;
  
  console.log();
  if (currentKey) {
    console.log(chalk.dim(`  Current Key: ${currentKey.substring(0, 6)}****`));
  } else {
    console.log(chalk.dim('  Get a key: https://tavily.com/'));
  }
  console.log();

  const apiKey = await input({
    message: 'Tavily API Key:',
    default: currentKey || undefined,
  });

  if (!apiKey.trim()) { 
    console.log(chalk.yellow('\n  Cancelled.')); 
    return; 
  }

  config.tools.web_search.api_key = apiKey.trim();
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  console.log(chalk.green('\n  [ok] Tavily API key saved.'));
  await autoRestartGateway();
}

async function configTelegram(config: AnyaConfig): Promise<void> {
  const currentToken = config.telegram?.bot_token;
  const currentUsers = config.telegram?.allowed_user_ids || [];
  
  console.log();
  if (config.telegram.enabled && currentToken) {
    console.log(chalk.dim(`  Bot Token:     ${maskKey(currentToken)}`));
    console.log(chalk.dim(`  Allowed Users: ${currentUsers.length ? currentUsers.join(', ') : 'all'}`));
    console.log();
    const update = await confirm({
      message: 'Update Telegram settings?',
      default: false,
    });
    if (!update) return;
  } else {
    console.log(chalk.dim('  Create a bot via @BotFather on Telegram to get a token.'));
    console.log();
  }

  const botToken = await input({
    message: 'Telegram Bot Token:',
    default: currentToken || undefined,
  });

  if (!botToken.trim()) {
    console.log(chalk.yellow('\n  Cancelled. Telegram bot remains disabled/unchanged.'));
    return;
  }

  config.telegram.enabled = true;
  config.telegram.bot_token = botToken.trim();

  const userId = await input({
    message: 'Your Telegram User ID (numeric, press Enter to allow all):',
    default: currentUsers[0]?.toString() || undefined,
  });

  if (userId.trim()) {
    config.telegram.allowed_user_ids = [parseInt(userId.trim(), 10)];
  } else {
    config.telegram.allowed_user_ids = [];
  }

  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  console.log(chalk.green('\n  [ok] Telegram configured.'));
  await autoRestartGateway();
}

async function configOpenAI(config: AnyaConfig): Promise<void> {
  const { codexDeviceLogin, hasCodexAuth } = await import('../lib/auth.js');
  
  console.log();
  if (hasCodexAuth()) {
    console.log(chalk.green('  ✓ OpenAI Codex is already authenticated.'));
    const reauth = await confirm({ message: 'Do you want to re-authenticate?', default: false });
    if (!reauth) {
      console.log(chalk.green('\n  [ok] OpenAI Codex is ready to use.'));
      return;
    }
  }

  await codexDeviceLogin();
  console.log(chalk.green('\n  [ok] OpenAI Codex configured successfully.'));
  await autoRestartGateway();
}

async function configCron(config: AnyaConfig): Promise<void> {
  console.log();
  console.log(chalk.dim('  Cron runs scheduled jobs while the Telegram gateway is running.'));
  console.log(chalk.dim(`  Enabled:      ${config.cron.enabled ? 'yes' : 'no'}`));
  console.log(chalk.dim(`  Tick seconds: ${config.cron.tick_seconds}`));
  console.log(chalk.dim(`  Timezone:     ${config.cron.timezone}`));
  console.log(chalk.dim(`  Default chat: ${config.cron.default_chat_id || '(not set)'}`));
  console.log();

  config.cron.enabled = await confirm({
    message: 'Enable background cron scheduler?',
    default: config.cron.enabled,
  });

  const tickSeconds = await input({
    message: 'Tick interval seconds:',
    default: String(config.cron.tick_seconds || 60),
  });
  config.cron.tick_seconds = Math.max(10, Number(tickSeconds || 60));

  const timezone = await input({
    message: 'Timezone:',
    default: config.cron.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  });
  config.cron.timezone = timezone.trim() || 'UTC';

  const defaultChat = await input({
    message: 'Default Telegram chat ID for cron pushes:',
    default: config.cron.default_chat_id || undefined,
  });
  config.cron.default_chat_id = defaultChat.trim();

  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  console.log(chalk.green('\n  [ok] Cron configured.'));
  await autoRestartGateway();
}
