import type { Command } from 'commander';

export function registerDoctor(program: Command): void {
  program
    .command('doctor')
    .description('Check environment and configuration')
    .action(async () => {
      const chalk = (await import('chalk')).default;
      const { isInitialized, CONFIG_PATH, ANYA_HOME } = await import('../../src/lib/paths.js');

      console.log(chalk.bold.cyan('\nAnya Doctor\n'));

      const nodeVersion = process.version;
      const major = parseInt(nodeVersion.slice(1), 10);
      console.log(`  Node.js:   ${major >= 22 ? '[ok]' : '[!!]'} ${nodeVersion} ${major < 22 ? '(>= 22 required)' : ''}`);

      const inited = isInitialized();
      console.log(`  Init:      ${inited ? '[ok]' : '[!!]'} ${inited ? CONFIG_PATH : 'Not initialized. Run: anya init'}`);

      if (inited) {
        const { loadConfig } = await import('../../src/config/loader.js');
        const config = loadConfig();

        // LLM — OpenAI Codex
        const { hasCodexAuth } = await import('../../src/lib/auth.js');
        const hasAuth = hasCodexAuth();
        console.log(`  LLM:       ${hasAuth ? '[ok]' : '[!!]'} OpenAI Codex (${config.provider.model}) ${hasAuth ? '✓' : 'not authenticated'}`);

        // Gemini — vision + image gen
        const hasGemini = !!config.gemini?.api_key;
        console.log(`  Gemini:    ${hasGemini ? '[ok]' : '[--]'} ${hasGemini ? 'API key configured (Vision + ImageGen)' : 'not configured'}`);

        // Azure — TTS + pron assessment
        const hasAzure = !!config.azure?.speech_key;
        console.log(`  Azure:     ${hasAzure ? '[ok]' : '[--]'} ${hasAzure ? `Speech (${config.azure.speech_region})` : 'not configured (TTS + pron unavailable)'}`);

        const hasTavily = !!config.tools.web_search.api_key;
        console.log(`  Tavily:    ${hasTavily ? '[ok]' : '[--]'} ${hasTavily ? 'configured' : 'not configured (web_search unavailable)'}`);

        const hasSTT = !!config.stt?.groq_api_key;
        console.log(`  STT:       ${hasSTT ? '[ok]' : '[--]'} ${hasSTT ? 'Groq Whisper' : 'not configured (voice messages unavailable)'}`);

        const hasTelegram = config.telegram?.enabled;
        console.log(`  Telegram:  ${hasTelegram ? '[ok]' : '[--]'} ${hasTelegram ? 'enabled' : 'not configured'}`);

        const { loadSkills } = await import('../../src/skills/loader.js');
        const skills = loadSkills();
        console.log(`  Skills:    [..] ${skills.length} installed`);

        const { isServiceRunning } = await import('../../src/lib/pidfile.js');
        const gw = isServiceRunning('gateway');
        console.log(`  Gateway:   ${gw.running ? '[ok] running (PID ' + gw.pid + ')' : '[--] stopped'}`);
        const cr = isServiceRunning('cron');
        console.log(`  Cron:      ${cr.running ? '[ok] running (PID ' + cr.pid + ')' : '[--] stopped'}`);
      }

      console.log(`  Data dir:  [..] ${ANYA_HOME}`);
      console.log();
    });
}
