#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import chalk from 'chalk';

import { runInit } from '../src/commands/init.js';
import { runUsage } from '../src/commands/usage.js';
import { runConfigMenu, runConfigShow } from '../src/commands/config.js';
import {
  runGatewayStart,
  runGatewayStop,
  runGatewayRestart,
  runGatewayStatus,
  runGatewayLogs,
} from '../src/commands/gateway.js';
import { isInitialized, CONFIG_PATH, ANYA_HOME, SKILLS_DIR } from '../src/lib/paths.js';
import { loadConfig } from '../src/config/loader.js';
import { loadSkills, getSkill, listSkillFiles } from '../src/skills/loader.js';
import { isServiceRunning } from '../src/lib/pidfile.js';
import { listSessions, searchMessages } from '../src/storage/sessionStore.js';

// Resolve package.json for version
const __dirname = dirname(fileURLToPath(import.meta.url));
let version = '0.1.0';
try {
  for (const rel of ['../package.json', '../../package.json']) {
    try {
      const pkg = JSON.parse(readFileSync(join(__dirname, rel), 'utf-8'));
      version = pkg.version;
      break;
    } catch { /* try next */ }
  }
} catch { /* use default */ }

const program = new Command();

program
  .name('anya')
  .description('Anya — Personal AI agent')
  .version(version, '-v, --version')
  .addHelpCommand(false)  // remove implicit "help [command]" subcommand
  .action(() => {
    program.outputHelp();
  });

program
  .command('init')
  .description('Initialize ~/.anya/ directory and configuration')
  .action(async () => {
    await runInit();
  });

// --- Config Command ---
const configCmd = program
  .command('config')
  .description('Manage configuration')
  .action(async () => {
    await runConfigMenu();
  });

configCmd
  .command('show')
  .description('Show current configuration')
  .action(() => {
    runConfigShow();
  });

configCmd
  .command('edit')
  .description('Open config.json in $EDITOR')
  .action(() => {
    const editor = process.env.EDITOR || 'vi';
    execFileSync(editor, [CONFIG_PATH], { stdio: 'inherit' });
  });

// --- Doctor Command ---
program
  .command('doctor')
  .description('Check environment and configuration')
  .action(async () => {
    console.log(chalk.bold.cyan('\nAnya Doctor\n'));

    const inited = isInitialized();
    if (!inited) {
      console.log(chalk.yellow('  Not initialized. Run: anya init\n'));
      return;
    }

    const config = loadConfig();

    // ChatGPT — Codex
    const { hasCodexAuth } = await import('../src/lib/auth.js');
    const hasCodex = hasCodexAuth();
    console.log(
      `  ChatGPT:   ${hasCodex ? '[ok]' : '[!!]'} Codex OAuth (${config.provider.model}) ${hasCodex ? '✓' : 'not authenticated'}`,
    );

    // Vision — Gemini
    const hasGeminiKey = !!config.gemini?.api_key;
    console.log(
      `  Gemini:    ${hasGeminiKey ? '[ok]' : '[!!]'} Vision (${config.gemini?.vision_model}) ${hasGeminiKey ? '✓' : 'API key not set'}`,
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

// --- Skills Command ---
const skillsCmd = program
  .command('skills')
  .description('Manage installed skills');

skillsCmd
  .command('list')
  .description('List all installed skills')
  .action(() => {
    const skills = loadSkills(true);

    if (skills.length === 0) {
      console.log('\n  No skills installed.');
      console.log('  Skills are created by the agent during conversations, or you can create them manually.\n');
      return;
    }

    console.log(`\n  ${chalk.bold('Installed Skills')} (${skills.length})\n`);

    for (const s of skills) {
      console.log(`    ${chalk.cyan(s.name)} - ${s.description}`);
    }
    console.log('');
  });

skillsCmd
  .command('view <name>')
  .description("View a skill's full content")
  .action((name: string) => {
    const skill = getSkill(name);
    if (!skill) {
      const all = loadSkills();
      console.error(`\n  Error: Skill "${name}" not found.`);
      if (all.length > 0) console.error(`  Available: ${all.map(s => s.name).join(', ')}`);
      console.log('');
      process.exit(1);
    }

    console.log(`\n  ${chalk.bold(skill.name)}`);
    console.log(`  ${chalk.dim(skill.description)}`);
    console.log(`  Path: ${chalk.dim(skill.filePath)}`);

    const files = listSkillFiles(name);
    if (files.length > 0) console.log(`  Attached: ${files.join(', ')}`);

    console.log(`\n${skill.body}\n`);
  });

skillsCmd
  .command('create <name>')
  .description('Create a new empty skill template')
  .option('-c, --category <category>', 'Category subdirectory', 'general')
  .action((name: string, opts: { category: string }) => {
    const skillDir = join(SKILLS_DIR, opts.category, name);
    const skillPath = join(skillDir, 'SKILL.md');

    if (existsSync(skillPath)) {
      console.error(`\n  Error: Skill "${name}" already exists at ${skillPath}\n`);
      process.exit(1);
    }

    const template = `---
name: ${name}
description: TODO - describe what this skill does
---

# When to Use

Describe the situations where this skill should be activated.

# Procedure

1. Step one
2. Step two
3. Step three

# Pitfalls

- Common mistake to avoid

# Verification

How to confirm the task was completed correctly.
`;

    mkdirSync(skillDir, { recursive: true });
    writeFileSync(skillPath, template, 'utf-8');

    console.log(`\n  [ok] Created skill template: ${skillPath}`);
    console.log(`  Edit the SKILL.md to fill in the procedure.\n`);
  });

// --- Gateway Command ---
const gatewayCmd = program
  .command('gateway')
  .description('Manage Telegram bot gateway');

gatewayCmd
  .command('start')
  .description('Start the Telegram gateway')
  .option('--_bg_child', { hidden: true } as any)
  .action(async (opts: { _bg_child?: boolean }) => {
    await runGatewayStart(opts._bg_child);
  });

gatewayCmd
  .command('stop')
  .description('Stop the Telegram gateway')
  .action(async () => {
    await runGatewayStop();
  });

gatewayCmd
  .command('restart')
  .description('Restart the Telegram gateway')
  .action(async () => {
    await runGatewayRestart();
  });

gatewayCmd
  .command('status')
  .description('Show gateway status')
  .action(() => {
    runGatewayStatus();
  });

gatewayCmd
  .command('logs')
  .description('View gateway logs')
  .option('-n, --lines <n>', 'Number of lines to show', '50')
  .action((opts: { lines: string }) => {
    runGatewayLogs(parseInt(opts.lines, 10));
  });

// --- Sessions Command ---
const sessionsCmd = program
  .command('sessions')
  .description('Manage chat sessions');

sessionsCmd
  .command('list')
  .description('List recent sessions')
  .option('-n, --limit <n>', 'Number of sessions to show', '20')
  .action((opts: { limit: string }) => {
    const sessions = listSessions(parseInt(opts.limit, 10));

    if (sessions.length === 0) {
      console.log('\n  No sessions found.\n');
      return;
    }

    console.log(`\n  ${chalk.bold('Recent Sessions')}\n`);
    for (const s of sessions) {
      const title = s.title || chalk.dim('(untitled)');
      const date = chalk.dim(s.updatedAt);
      const msgs = chalk.dim(`${s.messageCount} msgs`);
      console.log(`  ${chalk.cyan(s.id.substring(0, 8))} ${title} ${msgs} ${date}`);
    }
    console.log('');
  });

sessionsCmd
  .command('search <query>')
  .description('Search messages')
  .action((query: string) => {
    const results = searchMessages(query);

    if (results.length === 0) {
      console.log(`\n  No results found for "${query}".\n`);
      return;
    }

    console.log(`\n  ${chalk.bold('Search Results')} (${results.length})\n`);
    for (const r of results) {
      const preview = r.content.substring(0, 100).replace(/\n/g, ' ');
      console.log(`  ${chalk.cyan(r.sessionId.substring(0, 8))} ${preview}`);
    }
    console.log('');
  });

// --- Data Transfer Command ---
program
  .command('export <file>')
  .description('Export ~/.anya/ data')
  .action((file: string) => {
    execFileSync('tar', ['-czf', file, '-C', ANYA_HOME, '.'], { stdio: 'inherit' });
    console.log(`\n  [ok] Exported to ${file}\n`);
  });

// --- Usage Command ---
program
  .command('usage')
  .description('Show monthly API usage statistics')
  .option('-m, --month <YYYY-MM>', 'Show a specific month (default: current)')
  .action((options) => {
    runUsage(options.month);
  });

program.parse();
