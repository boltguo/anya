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
} from '../lib/paths.js';
import { DEFAULT_CONFIG, type VelaConfig } from '../config/defaults.js';

/**
 * `vela init` -- Interactive setup wizard.
 *
 * Creates ~/.vela/ directory structure and guides the user
 * through initial configuration.
 */
export async function runInit(): Promise<void> {
  console.log();
  console.log(chalk.bold.cyan('Vela Setup'));
  console.log(chalk.dim('  Configure your personal AI agent\n'));

  // Check if already initialized
  if (isInitialized()) {
    const overwrite = await confirm({
      message: '~/.vela/ already exists. Overwrite config? (memory and skills will be preserved)',
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
  const config: VelaConfig = { ...DEFAULT_CONFIG };

  // --- Gemini API Key (required) ---
  console.log();
  console.log(chalk.bold('1. Gemini API Key') + chalk.dim(' (required)'));
  console.log(chalk.dim('   Get a free key: https://aistudio.google.com/\n'));

  const apiKey = await input({
    message: 'Gemini API Key:',
    validate: (value) => {
      if (!value.trim()) return 'API key is required';
      return true;
    },
  });
  config.provider.api_key = apiKey.trim();

  // --- Tavily API Key (optional) ---
  console.log();
  console.log(chalk.bold('2. Tavily API Key') + chalk.dim(' (optional, for web search)'));
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
    writeFileSync(USER_MD_PATH, '# User Profile\n\n_Vela will learn about you over time._\n', 'utf-8');
  }
  console.log(chalk.dim('  [ok] memory/USER.md'));

  if (!existsSync(MEMORY_MD_PATH)) {
    writeFileSync(MEMORY_MD_PATH, '# Agent Notes\n\n_Vela will save notes here as it learns._\n', 'utf-8');
  }
  console.log(chalk.dim('  [ok] memory/MEMORY.md'));

  // --- Initialize cron jobs ---
  if (!existsSync(CRON_JOBS_PATH)) {
    writeFileSync(CRON_JOBS_PATH, '[]', 'utf-8');
  }
  console.log(chalk.dim('  [ok] cron/jobs.json'));

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
  console.log(chalk.dim('  Start chatting: ') + chalk.bold('vela chat'));
  console.log(chalk.dim('  View config:    ') + chalk.bold('vela config show'));
  console.log(chalk.dim('  Health check:   ') + chalk.bold('vela doctor'));
  console.log();
}
