// commands/doctor.ts — `anya doctor` environment check

import chalk from 'chalk';
import { isInitialized } from '../lib/paths.js';
import { loadConfig } from '../config/loader.js';
import { loadSkills } from '../skills/loader.js';
import { isServiceRunning } from '../lib/pidfile.js';

export async function runDoctor(): Promise<void> {
  console.log(chalk.bold.cyan('\nAnya Doctor\n'));

  if (!isInitialized()) {
    console.log(chalk.yellow('  Not initialized. Run: anya init\n'));
    return;
  }

  const config = loadConfig();

  const { hasCodexAuth } = await import('../providers/openai/auth.js');
  const codexReady = hasCodexAuth();
  console.log(
    `  LLM:       ${codexReady ? '[ok]' : '[!!]'} codex (${config.provider.model}) ${codexReady ? '✓' : 'not authenticated'}`,
  );

  const hasGeminiKey = !!config.gemini?.api_key;
  console.log(
    `  Gemini:    ${hasGeminiKey ? '[ok]' : '[!!]'} Vision (${config.gemini?.vision_model}) ${hasGeminiKey ? '✓' : 'API key not set'}`,
  );

  const hasAzure = !!config.azure?.speech_key;
  console.log(
    `  Azure:     ${hasAzure ? '[ok]' : '[--]'} ${hasAzure ? `Speech (${config.azure.speech_region})` : 'not configured (TTS + pron unavailable)'}`,
  );

  const hasTavily = !!config.tools.web_search.api_key;
  console.log(
    `  Tavily:    ${hasTavily ? '[ok]' : '[--]'} ${hasTavily ? 'configured' : 'not configured (web_search unavailable)'}`,
  );

  const hasSTT = !!config.stt?.groq_api_key;
  console.log(
    `  STT:       ${hasSTT ? '[ok]' : '[--]'} ${hasSTT ? 'Groq Whisper' : 'not configured (voice messages unavailable)'}`,
  );

  const hasTelegram = config.telegram?.enabled;
  console.log(
    `  Telegram:  ${hasTelegram ? '[ok]' : '[--]'} ${hasTelegram ? 'enabled' : 'not configured'}`,
  );

  const skills = loadSkills();
  console.log(`  Skills:    [..] ${skills.length} loaded`);

  const gw = isServiceRunning('gateway');
  console.log(
    `  Gateway:   ${gw.running ? '[ok] running (PID ' + gw.pid + ')' : '[--] stopped'}`,
  );
  console.log();
}
