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

        const active = config.provider.active;
        if (active === 'gemini') {
          const hasKey = !!config.provider.gemini.api_key;
          console.log(`  Auth:      ${hasKey ? '[ok]' : '[!!]'} Gemini API key ${hasKey ? 'configured' : 'not configured'}`);
        } else {
          const { hasCodexAuth } = await import('../../src/lib/auth.js');
          const hasAuth = hasCodexAuth();
          console.log(`  Auth:      ${hasAuth ? '[ok]' : '[!!]'} OpenAI Codex ${hasAuth ? 'authenticated' : 'not authenticated'}`);
        }

        const hasTavily = !!config.tools.web_search.api_key;
        console.log(`  Tavily:    ${hasTavily ? '[ok]' : '[--]'} ${hasTavily ? 'configured' : 'not configured (web_search unavailable)'}`);

        const hasSTT = !!config.stt?.groq_api_key;
        console.log(`  STT:       ${hasSTT ? '[ok]' : '[--]'} ${hasSTT ? `Groq Whisper (${config.stt?.model || 'whisper-large-v3-turbo'})` : 'not configured (voice messages unavailable)'}`);

        const hasVision = !!(config.vision?.gemini_api_key || config.provider?.gemini?.api_key);
        console.log(`  Vision:    ${hasVision ? '[ok]' : '[--]'} ${hasVision ? `Gemini (${config.vision?.model || 'gemini-3-flash-preview'})` : 'not configured (photo analysis unavailable)'}`);

        const ttsVoice = config.tts?.voice || 'en-US-AriaNeural';
        console.log(`  TTS:       [ok] Edge TTS (${ttsVoice})`);

        const model = active === 'openai' ? config.provider.openai.model : config.provider.gemini.model;
        console.log(`  Provider:  [..] ${active}`);
        console.log(`  Model:     [..] ${model}`);

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
