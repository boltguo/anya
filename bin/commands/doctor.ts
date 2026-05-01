import type { Command } from 'commander';
import chalk from 'chalk';
import { isInitialized } from '../../src/lib/paths.js';
import { loadConfig } from '../../src/config/loader.js';
import { loadSkills } from '../../src/skills/loader.js';
import { isServiceRunning } from '../../src/lib/pidfile.js';

export function registerDoctor(program: Command): void {
  program
    .command('doctor')
    .description('Check environment and configuration')
    .action(() => {
      console.log(chalk.bold.cyan('\nAnya Doctor\n'));

      const inited = isInitialized();
      if (!inited) {
        console.log(chalk.yellow('  Not initialized. Run: anya init\n'));
        return;
      }

      const config = loadConfig();

      // LLM — Gemini
      const hasLlmKey = !!config.gemini?.api_key;
      console.log(
        `  LLM:       ${hasLlmKey ? '[ok]' : '[!!]'} Gemini (${config.provider.model}) ${hasLlmKey ? '✓' : 'API key not set'}`,
      );

      // Azure — TTS + pron assessment
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
      console.log(`  Skills:    [..] ${skills.length} installed`);

      const gw = isServiceRunning('gateway');
      console.log(
        `  Gateway:   ${gw.running ? '[ok] running (PID ' + gw.pid + ')' : '[--] stopped'}`,
      );
      console.log();
    });
}
