/**
 * @module commands/init
 * @description First-run initialization for ~/.anya/ directory.
 *
 * Creates the directory structure, writes default config and templates.
 * Safe to re-run — only creates missing files.
 * No interactive prompts — use `anya config` for API keys.
 */

import { writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
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
import { DEFAULT_CONFIG } from '../config/defaults.js';

/**
 * `anya init` — Non-interactive setup.
 *
 * Creates ~/.anya/ directory structure and writes default files.
 * All API keys are configured separately via `anya config`.
 */
export async function runInit(): Promise<void> {
  console.log();
  console.log(chalk.bold.cyan('Anya Init'));

  if (isInitialized()) {
    console.log(chalk.dim('  ~/.anya/ already exists. Skipping existing files.\n'));
  }

  // Resolve __dirname once for all template lookups
  const __dirname = dirname(fileURLToPath(import.meta.url));

  // 1. Create directory structure
  ensureDirectories();
  console.log(chalk.dim('  [ok] directories'));

  // 2. Write default config (only if missing)
  if (!existsSync(CONFIG_PATH)) {
    writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n', 'utf-8');
    console.log(chalk.dim('  [ok] config.json (default)'));
  } else {
    console.log(chalk.dim('  [ok] config.json (exists)'));
  }

  // 3. Copy config schema
  try {
    for (const rel of ['../src/config/schema.json', '../config/schema.json']) {
      const src = join(__dirname, rel);
      if (existsSync(src)) {
        copyFileSync(src, CONFIG_SCHEMA_PATH);
        break;
      }
    }
    console.log(chalk.dim('  [ok] config.schema.json'));
  } catch { /* non-critical */ }

  // 4. Memory files
  for (const { label, dest, template, fallback } of [
    {
      label: 'USER.md',
      dest: USER_MD_PATH,
      template: 'USER.template.md',
      fallback: '# User Profile\n\n_Anya will learn about you over time._\n',
    },
    {
      label: 'MEMORY.md',
      dest: MEMORY_MD_PATH,
      template: 'MEMORY.template.md',
      fallback: '# Agent Notes\n\n_Compressed notes and current context._\n',
    },
  ]) {
    if (!existsSync(dest)) {
      let copied = false;
      try {
        for (const rel of [
          `../src/config/${template}`,
          `../config/${template}`,
        ]) {
          const src = join(__dirname, rel);
          if (existsSync(src)) {
            copyFileSync(src, dest);
            copied = true;
            break;
          }
        }
      } catch {
        copied = false;
      }
      if (!copied) {
        writeFileSync(dest, fallback, 'utf-8');
      }
    }
    console.log(chalk.dim(`  [ok] ${label}`));
  }
  console.log(chalk.dim('  [ok] memories/'));

  // 5. Cron jobs
  if (!existsSync(CRON_JOBS_PATH)) {
    try {

      let written = false;
      for (const rel of ['../src/cron/default_jobs.json', '../cron/default_jobs.json']) {
        const src = join(__dirname, rel);
        if (existsSync(src)) { copyFileSync(src, CRON_JOBS_PATH); written = true; break; }
      }
      if (!written) writeFileSync(CRON_JOBS_PATH, '[]', 'utf-8');
    } catch {
      writeFileSync(CRON_JOBS_PATH, '[]', 'utf-8');
    }
  }
  console.log(chalk.dim('  [ok] cron/'));

  // 6. RULES file
  const { RULES_PATH } = await import('../lib/paths.js');
  for (const { label, dest, template } of [
    { label: 'RULES.md', dest: RULES_PATH, template: 'RULES.template.md' },
  ]) {
    if (!existsSync(dest)) {
      try {
        for (const rel of [`../src/config/${template}`, `../config/${template}`]) {
          const src = join(__dirname, rel);
          if (existsSync(src)) { copyFileSync(src, dest); break; }
        }
      } catch { /* non-critical */ }
    }
    console.log(chalk.dim(`  [ok] ${label}`));
  }

  // 7. Copy bundled skills
  try {
    const { cpSync } = await import('node:fs');
    const __dir = dirname(fileURLToPath(import.meta.url));
    const { SKILLS_DIR } = await import('../lib/paths.js');

    for (const rel of ['../src/skills/bundled', '../skills/bundled']) {
      const src = join(__dir, rel);
      if (existsSync(src)) {
        cpSync(src, join(SKILLS_DIR, '.bundled'), { recursive: true, force: true });
        console.log(chalk.dim('  [ok] skills/'));
        break;
      }
    }
  } catch { /* non-critical */ }

  // Done
  console.log();
  console.log(chalk.bold.green('✓ Init complete'));
  console.log();
  console.log(chalk.dim('  Next steps:'));
  console.log(`    ${chalk.bold('anya config')}  — Sign in to OpenAI, configure Gemini / Azure / Telegram`);
  console.log(`    ${chalk.bold('anya doctor')}  — Verify configuration`);
  console.log();
}
