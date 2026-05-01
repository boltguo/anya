/**
 * @module commands/init
 * @description First-run initialization for ~/.anya/ directory.
 *
 * Creates the directory structure, writes default config and templates.
 * Safe to re-run — only creates missing files.
 * No interactive prompts — use `anya config` for API keys.
 */

import { writeFileSync, copyFileSync, existsSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import {
  ensureDirectories,
  CONFIG_PATH,
  CONFIG_SCHEMA_PATH,
  USER_MD_PATH,
  MEMORY_MD_PATH,
  SKILLS_DIR,
  RULES_PATH,
  isInitialized,
} from '../lib/paths.js';
import { DEFAULT_CONFIG } from '../config/defaults.js';

/**
 * Resolve an asset bundled with the CLI. Looks in the two layouts we ship:
 *   - dist/<rel>  (production: postbuild copies assets next to the bin)
 *   - src/<rel>   (dev: running via tsx against source)
 * Returns the first path that exists, or null.
 */
function resolveAsset(__dirname: string, rel: string): string | null {
  const candidates = [
    join(__dirname, '..', rel),           // dist/<rel> relative to dist/bin/
    join(__dirname, '..', 'src', rel),    // src/<rel> relative to dist/bin/ (dev layout)
    join(__dirname, '..', '..', rel),     // src/<rel> relative to src/commands/ (tsx dev)
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

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
  const schemaSrc = resolveAsset(__dirname, 'config/schema.json');
  if (schemaSrc) {
    copyFileSync(schemaSrc, CONFIG_SCHEMA_PATH);
    console.log(chalk.dim('  [ok] config.schema.json'));
  } else {
    console.log(chalk.yellow('  [warn] config.schema.json template not found'));
  }

  // 4. Memory templates — RULES.md, USER.md, MEMORY.md all live under
  //    src/config/ and are treated as infrastructure. The IELTS init skill
  //    handles runtime onboarding; it does not own these files.
  for (const { label, dest, template } of [
    { label: 'RULES.md',  dest: RULES_PATH,     template: 'RULES.template.md' },
    { label: 'USER.md',   dest: USER_MD_PATH,   template: 'USER.template.md' },
    { label: 'MEMORY.md', dest: MEMORY_MD_PATH, template: 'MEMORY.template.md' },
  ]) {
    if (!existsSync(dest)) {
      const src = resolveAsset(__dirname, `config/${template}`);
      if (src) {
        copyFileSync(src, dest);
      } else {
        console.log(chalk.yellow(`  [warn] ${template} not found — skipping ${label}`));
        continue;
      }
    }
    console.log(chalk.dim(`  [ok] ${label}`));
  }
  console.log(chalk.dim('  [ok] memories/'));


  // 5. Bundled skills
  let skillsSrc = resolveAsset(__dirname, 'skills');
  if (skillsSrc && existsSync(join(skillsSrc, 'bundled'))) {
    // Development mode (src/skills) -> copy from src/skills/bundled
    skillsSrc = join(skillsSrc, 'bundled');
  }
  
  if (skillsSrc) {
    cpSync(skillsSrc, SKILLS_DIR, { recursive: true, force: true });
    console.log(chalk.dim('  [ok] skills/'));
  } else {
    console.log(chalk.yellow('  [warn] bundled skills not found'));
  }

  // Done
  console.log();
  console.log(chalk.bold.green('✓ Init complete'));
  console.log();
  console.log(chalk.dim('  Next steps:'));
  console.log(`    ${chalk.bold('anya config')}  — Configure Gemini API key, Azure / Telegram`);
  console.log(`    ${chalk.bold('anya doctor')}  — Verify configuration`);
  console.log();
}
