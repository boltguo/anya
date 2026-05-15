// commands/init.ts — first-run scaffolding of ~/.anya/

import { writeFileSync, copyFileSync, existsSync, cpSync, rmSync } from 'node:fs';
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
  SOUL_PATH,
  RULES_PATH,
  isInitialized,
} from '../lib/paths.js';
import { DEFAULT_CONFIG } from '../config/defaults.js';

// supports both dist/ and src/ (tsx) layouts
function resolveAsset(__dirname: string, rel: string): string | null {
  const candidates = [
    join(__dirname, '..', rel),
    join(__dirname, '..', 'src', rel),
    join(__dirname, '..', '..', rel),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

export async function runInit(): Promise<void> {
  console.log();
  console.log(chalk.bold.cyan('Anya Init'));

  if (isInitialized()) {
    console.log(chalk.dim('  ~/.anya/ already exists. Skipping existing files.\n'));
  }

  const __dirname = dirname(fileURLToPath(import.meta.url));

  ensureDirectories();
  console.log(chalk.dim('  [ok] directories'));

  if (!existsSync(CONFIG_PATH)) {
    writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n', 'utf-8');
    console.log(chalk.dim('  [ok] config.json (default)'));
  } else {
    console.log(chalk.dim('  [ok] config.json (exists)'));
  }

  const schemaSrc = resolveAsset(__dirname, 'config/schema.json');
  if (schemaSrc) {
    copyFileSync(schemaSrc, CONFIG_SCHEMA_PATH);
    console.log(chalk.dim('  [ok] config.schema.json'));
  } else {
    console.log(chalk.yellow('  [warn] config.schema.json template not found'));
  }

  // SOUL=identity, RULES=operating contract, USER=user profile, MEMORY=learner state.
  // Onboarding skill fills USER/MEMORY only; SOUL/RULES are owned by init.
  for (const { label, dest, template } of [
    { label: 'SOUL.md',   dest: SOUL_PATH,      template: 'SOUL.template.md' },
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


  let skillsSrc = resolveAsset(__dirname, 'skills');
  if (skillsSrc && existsSync(join(skillsSrc, 'bundled'))) {
    skillsSrc = join(skillsSrc, 'bundled');
  }
  
  if (skillsSrc) {
    for (const oldBundledPath of [
      join(SKILLS_DIR, 'ielts'),
      join(SKILLS_DIR, 'support', 'ielts-data-contract'),
      join(SKILLS_DIR, 'support', 'ielts-band-descriptors'),
    ]) {
      if (existsSync(oldBundledPath)) {
        rmSync(oldBundledPath, { recursive: true, force: true });
      }
    }
    cpSync(skillsSrc, SKILLS_DIR, { recursive: true, force: true });
    console.log(chalk.dim('  [ok] skills/'));
  } else {
    console.log(chalk.yellow('  [warn] bundled skills not found'));
  }

  console.log();
  console.log(chalk.bold.green('✓ Init complete'));
  console.log();
  console.log(chalk.dim('  Next steps:'));
  console.log(`    ${chalk.bold('anya config')}  — Configure Gemini API key, Azure / Telegram`);
  console.log(`    ${chalk.bold('anya doctor')}  — Verify configuration`);
  console.log();
}
