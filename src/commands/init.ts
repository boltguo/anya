import { writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { input, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import {
  ensureDirectories,
  CONFIG_PATH,
  CONFIG_SCHEMA_PATH,
  USER_MD_PATH,
  MEMORY_MD_PATH,
  CRON_JOBS_PATH,
  isInitialized,
  ANYA_HOME,
} from '../lib/paths.js';
import { DEFAULT_CONFIG, type AnyaConfig } from '../config/defaults.js';

/**
 * `anya init` -- Interactive setup wizard.
 *
 * Creates ~/.anya/ directory structure and guides the user
 * through initial configuration.
 */
export async function runInit(): Promise<void> {
  console.log();
  console.log(chalk.bold.cyan('Anya Setup'));
  console.log(chalk.dim('  Configure your personal AI agent\n'));

  // Check if already initialized
  if (isInitialized()) {
    const overwrite = await confirm({
      message: '~/.anya/ already exists. Overwrite config? (memory and skills will be preserved)',
      default: false,
    });

    if (!overwrite) {
      console.log(chalk.yellow('Cancelled.'));
      return;
    }
  }

  // Create directory structure
  console.log(chalk.dim('  Creating directory structure...'));
  ensureDirectories();

  // Build config
  const config: AnyaConfig = { ...DEFAULT_CONFIG };

  // --- 1. Model Provider ---
  console.log();
  const { selectProvider } = await import('./providerSelect.js');
  await selectProvider(config);

  // --- 2. Groq API Key (STT) ---
  console.log();
  console.log(chalk.bold('2. Groq API Key') + chalk.dim(' (optional, for voice message transcription)'));
  console.log(chalk.dim('   Get a free key: https://console.groq.com/\n'));

  const groqKey = await input({
    message: 'Groq API Key (press Enter to skip):',
  });
  if (groqKey.trim()) {
    config.stt.groq_api_key = groqKey.trim();

    const { select: selectPrompt } = await import('@inquirer/prompts');
    const sttModel = await selectPrompt({
      message: 'Whisper Model',
      choices: [
        { name: 'whisper-large-v3-turbo' + chalk.dim(' (faster, recommended)'), value: 'whisper-large-v3-turbo' },
        { name: 'whisper-large-v3' + chalk.dim(' (more accurate, slower)'), value: 'whisper-large-v3' },
      ],
      default: 'whisper-large-v3-turbo',
    });
    config.stt.model = sttModel;
  }

  // --- 3. Tavily API Key (optional) ---
  console.log();
  console.log(chalk.bold('3. Tavily API Key') + chalk.dim(' (optional, for web search)'));
  console.log(chalk.dim('   Get a free key: https://tavily.com/\n'));

  const tavilyKey = await input({
    message: 'Tavily API Key (press Enter to skip):',
  });
  if (tavilyKey.trim()) {
    config.tools.web_search.api_key = tavilyKey.trim();
  }

  // --- Telegram (optional) ---
  console.log();
  const enableTelegram = await confirm({
    message: 'Configure Telegram bot? (can be done later)',
    default: false,
  });

  if (enableTelegram) {
    const botToken = await input({
      message: 'Telegram Bot Token (from @BotFather):',
    });

    if (botToken.trim()) {
      config.telegram.enabled = true;
      config.telegram.bot_token = botToken.trim();

      const userId = await input({
        message: 'Your Telegram User ID (numeric):',
      });

      if (userId.trim()) {
        config.telegram.allowed_user_ids = [parseInt(userId.trim(), 10)];
      }
    }
  }

  // --- Write config ---
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  console.log(chalk.dim('  [ok] config.json'));

  // --- Copy schema ---
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const schemaSource = join(__dirname, '..', 'src', 'config', 'schema.json');
    const schemaSourceAlt = join(__dirname, '..', 'config', 'schema.json');

    if (existsSync(schemaSource)) {
      copyFileSync(schemaSource, CONFIG_SCHEMA_PATH);
    } else if (existsSync(schemaSourceAlt)) {
      copyFileSync(schemaSourceAlt, CONFIG_SCHEMA_PATH);
    } else {
      writeFileSync(CONFIG_SCHEMA_PATH, '{}', 'utf-8');
    }
    console.log(chalk.dim('  [ok] config.schema.json'));
  } catch {
    // Non-critical, skip
  }

  // --- Initialize memory files ---
  if (!existsSync(USER_MD_PATH)) {
    writeFileSync(USER_MD_PATH, '# User Profile\n\n_Anya will learn about you over time._\n', 'utf-8');
  }
  console.log(chalk.dim('  [ok] memory/USER.md'));

  if (!existsSync(MEMORY_MD_PATH)) {
    writeFileSync(MEMORY_MD_PATH, '# Agent Notes\n\n_Anya will save notes here as it learns._\n', 'utf-8');
  }
  console.log(chalk.dim('  [ok] memory/MEMORY.md'));

  // --- Initialize cron jobs ---
  if (!existsSync(CRON_JOBS_PATH)) {
    try {
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const jobsSource = join(__dirname, '..', 'src', 'cron', 'default_jobs.json');
      const jobsSourceAlt = join(__dirname, '..', 'cron', 'default_jobs.json');
      if (existsSync(jobsSource)) {
        copyFileSync(jobsSource, CRON_JOBS_PATH);
      } else if (existsSync(jobsSourceAlt)) {
        copyFileSync(jobsSourceAlt, CRON_JOBS_PATH);
      } else {
        writeFileSync(CRON_JOBS_PATH, '[]', 'utf-8');
      }
    } catch {
      writeFileSync(CRON_JOBS_PATH, '[]', 'utf-8');
    }
  }
  console.log(chalk.dim('  [ok] cron/jobs.json'));

  // --- Copy SOUL & RULES persona files ---
  const { SOUL_PATH, RULES_PATH } = await import('../lib/paths.js');
  for (const { label, dest, template } of [
    { label: 'SOUL.md', dest: SOUL_PATH, template: 'SOUL.template.md' },
    { label: 'RULES.md', dest: RULES_PATH, template: 'RULES.template.md' },
  ]) {
    if (!existsSync(dest)) {
      try {
        const __dirname = dirname(fileURLToPath(import.meta.url));
        const src1 = join(__dirname, '..', 'src', 'config', template);
        const src2 = join(__dirname, '..', 'config', template);

        if (existsSync(src1)) {
          copyFileSync(src1, dest);
          console.log(chalk.dim(`  [ok] ${label}`));
        } else if (existsSync(src2)) {
          copyFileSync(src2, dest);
          console.log(chalk.dim(`  [ok] ${label}`));
        }
      } catch {
        // Non-critical, skip
      }
    }
  }

  // --- Copy bundled skills ---
  try {
    const { cpSync } = await import('node:fs');
    const __dir = dirname(fileURLToPath(import.meta.url));
    // Try multiple paths (dev vs installed)
    const bundledPaths = [
      join(__dir, '..', 'src', 'skills', 'bundled'),
      join(__dir, '..', 'skills', 'bundled'),
    ];

    for (const bundledSrc of bundledPaths) {
      if (existsSync(bundledSrc)) {
        const { SKILLS_DIR } = await import('../lib/paths.js');
        const bundledDest = join(SKILLS_DIR, '.bundled');
        cpSync(bundledSrc, bundledDest, { recursive: true, force: true });
        console.log(chalk.dim('  [ok] skills/.bundled/ (example skills)'));
        break;
      }
    }
  } catch {
    // Non-critical, skip
  }

  // --- Done ---
  console.log();
  console.log(chalk.bold.green('Setup complete.'));
  console.log();
  console.log(chalk.dim('  Start chatting: ') + chalk.bold('anya chat'));
  console.log(chalk.dim('  View config:    ') + chalk.bold('anya config show'));
  console.log(chalk.dim('  Health check:   ') + chalk.bold('anya doctor'));
  console.log();
}
