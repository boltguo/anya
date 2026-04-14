#!/usr/bin/env node

// Suppress node:sqlite ExperimentalWarning
const _emit = process.emit;
// @ts-expect-error -- patching process.emit to filter warnings
process.emit = function (event: string, ...args: unknown[]) {
  if (event === 'warning' && ['ExperimentalWarning', 'DeprecationWarning'].includes((args[0] as { name?: string })?.name || '')) {
    return false;
  }
  return _emit.apply(process, [event, ...args] as Parameters<typeof _emit>);
};

import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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
  .description('Anya - A self-evolving personal AI agent')
  .version(version, '-v, --version');

// --- anya init ---
program
  .command('init')
  .description('Initialize ~/.anya/ directory and configuration')
  .action(async () => {
    const { runInit } = await import('../src/commands/init.js');
    await runInit();
  });

// --- anya chat ---
program
  .command('chat')
  .description('Start an interactive chat session with the agent')
  .option('-q, --query <message>', 'Single query mode (ask and exit)')
  .option('--new', 'Start a new session (ignore history)')
  .action(async (options) => {
    const { runChat } = await import('../src/commands/chat.js');
    await runChat(options);
  });

// --- anya config ---
const configCmd = program
  .command('config')
  .description('Manage configuration');

configCmd
  .command('show')
  .description('Show current configuration')
  .action(async () => {
    const { runConfigShow } = await import('../src/commands/config.js');
    runConfigShow();
  });

configCmd
  .command('edit')
  .description('Open config.json in $EDITOR')
  .action(async () => {
    const { execSync } = await import('node:child_process');
    const { CONFIG_PATH } = await import('../src/lib/paths.js');
    const editor = process.env.EDITOR || 'vi';
    execSync(`${editor} "${CONFIG_PATH}"`, { stdio: 'inherit' });
  });

// --- anya doctor ---
program
  .command('doctor')
  .description('Check environment and configuration')
  .action(async () => {
    const chalk = (await import('chalk')).default;
    const { isInitialized, CONFIG_PATH, ANYA_HOME } = await import('../src/lib/paths.js');

    console.log(chalk.bold.cyan('\nAnya Doctor\n'));

    const nodeVersion = process.version;
    const major = parseInt(nodeVersion.slice(1), 10);
    console.log(`  Node.js:   ${major >= 20 ? '[ok]' : '[!!]'} ${nodeVersion} ${major < 20 ? '(>= 20 required)' : ''}`);

    const inited = isInitialized();
    console.log(`  Init:      ${inited ? '[ok]' : '[!!]'} ${inited ? CONFIG_PATH : 'Not initialized. Run: anya init'}`);

    if (inited) {
      const { loadConfig } = await import('../src/config/loader.js');
      const config = loadConfig();

      const hasKey = !!config.provider.api_key;
      console.log(`  API Key:   ${hasKey ? '[ok]' : '[!!]'} Gemini ${hasKey ? 'configured' : 'not configured'}`);

      const hasTavily = !!config.tools.web_search.api_key;
      console.log(`  Tavily:    ${hasTavily ? '[ok]' : '[--]'} ${hasTavily ? 'configured' : 'not configured (web_search unavailable)'}`);

      console.log(`  Model:     [..] ${config.provider.primary}`);

      const { loadSkills } = await import('../src/skills/loader.js');
      const skills = loadSkills();
      console.log(`  Skills:    [..] ${skills.length} installed`);

      const { isServiceRunning } = await import('../src/lib/pidfile.js');
      const gw = isServiceRunning('gateway');
      console.log(`  Gateway:   ${gw.running ? '[ok] running (PID ' + gw.pid + ')' : '[--] stopped'}`);
      const cr = isServiceRunning('cron');
      console.log(`  Cron:      ${cr.running ? '[ok] running (PID ' + cr.pid + ')' : '[--] stopped'}`);
    }

    console.log(`  Data dir:  [..] ${ANYA_HOME}`);
    console.log();
  });

// --- anya skills ---
const skillsCmd = program
  .command('skills')
  .description('Manage installed skills');

skillsCmd
  .command('list')
  .description('List all installed skills')
  .action(async () => {
    const { loadSkills } = await import('../src/skills/loader.js');
    const chalk = (await import('chalk')).default;
    const skills = loadSkills(true);

    if (skills.length === 0) {
      console.log('\n  No skills installed.');
      console.log('  Skills are created by the agent during conversations, or you can create them manually.\n');
      return;
    }

    console.log(`\n  ${chalk.bold('Installed Skills')} (${skills.length})\n`);

    const byCategory = new Map<string, typeof skills>();
    for (const skill of skills) {
      const cat = skill.category || 'general';
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(skill);
    }

    for (const [category, catSkills] of byCategory) {
      console.log(`  ${chalk.dim(category + '/')}`);
      for (const s of catSkills) {
        const tags = s.tags.length > 0 ? chalk.dim(` [${s.tags.join(', ')}]`) : '';
        console.log(`    ${chalk.cyan(s.name)} - ${s.description}${tags}`);
      }
    }
    console.log('');
  });

skillsCmd
  .command('view <name>')
  .description('View a skill\'s full content')
  .action(async (name: string) => {
    const { getSkill, loadSkills, listSkillFiles } = await import('../src/skills/loader.js');
    const chalk = (await import('chalk')).default;

    const skill = getSkill(name);
    if (!skill) {
      const all = loadSkills();
      console.error(`\n  Error: Skill "${name}" not found.`);
      if (all.length > 0) console.error(`  Available: ${all.map(s => s.name).join(', ')}`);
      console.log('');
      process.exit(1);
    }

    console.log(`\n  ${chalk.bold(skill.name)} v${skill.version}`);
    console.log(`  ${chalk.dim(skill.description)}`);
    if (skill.tags.length > 0) console.log(`  Tags: ${skill.tags.join(', ')}`);
    console.log(`  Path: ${chalk.dim(skill.filePath)}`);

    const files = listSkillFiles(name);
    if (files.length > 0) console.log(`  Attached: ${files.join(', ')}`);

    console.log(`\n${skill.body}\n`);
  });

skillsCmd
  .command('create <name>')
  .description('Create a new empty skill template')
  .option('-c, --category <category>', 'Category subdirectory', 'general')
  .action(async (name: string, opts: { category: string }) => {
    const { writeFileSync, mkdirSync, existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { SKILLS_DIR } = await import('../src/lib/paths.js');

    const skillDir = join(SKILLS_DIR, opts.category, name);
    const skillPath = join(skillDir, 'SKILL.md');

    if (existsSync(skillPath)) {
      console.error(`\n  Error: Skill "${name}" already exists at ${skillPath}\n`);
      process.exit(1);
    }

    const template = `---
name: ${name}
description: TODO - describe what this skill does
version: 1.0.0
tags: []
category: ${opts.category}
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

// --- anya gateway ---
const gatewayCmd = program
  .command('gateway')
  .description('Manage Telegram bot gateway');

gatewayCmd
  .command('start')
  .description('Start the Telegram gateway')
  .option('--foreground', 'Run in foreground (for debugging)')
  .action(async (opts: { foreground?: boolean }) => {
    const { runGatewayStart } = await import('../src/commands/gateway.js');
    await runGatewayStart(opts.foreground);
  });

gatewayCmd
  .command('stop')
  .description('Stop the Telegram gateway')
  .action(async () => {
    const { runGatewayStop } = await import('../src/commands/gateway.js');
    await runGatewayStop();
  });

gatewayCmd
  .command('restart')
  .description('Restart the Telegram gateway')
  .action(async () => {
    const { runGatewayRestart } = await import('../src/commands/gateway.js');
    await runGatewayRestart();
  });

gatewayCmd
  .command('status')
  .description('Show gateway status')
  .action(async () => {
    const { runGatewayStatus } = await import('../src/commands/gateway.js');
    runGatewayStatus();
  });

gatewayCmd
  .command('logs')
  .description('View gateway logs')
  .option('-n, --lines <n>', 'Number of lines to show', '50')
  .action(async (opts: { lines: string }) => {
    const { runGatewayLogs } = await import('../src/commands/gateway.js');
    runGatewayLogs(parseInt(opts.lines, 10));
  });

// --- anya cron ---
const cronCmd = program
  .command('cron')
  .description('Manage cron jobs');

cronCmd
  .command('start')
  .description('Start the cron scheduler')
  .action(async () => {
    const { startScheduler } = await import('../src/cron/scheduler.js');
    startScheduler();
  });

cronCmd
  .command('stop')
  .description('Stop the cron scheduler')
  .action(async () => {
    const { stopService } = await import('../src/lib/pidfile.js');
    const stopped = await stopService('cron');
    console.log(stopped ? '\n  [ok] Cron stopped.\n' : '\n  Cron is not running.\n');
  });

cronCmd
  .command('status')
  .description('Show cron scheduler status')
  .action(async () => {
    const chalk = (await import('chalk')).default;
    const { isServiceRunning } = await import('../src/lib/pidfile.js');
    const { running, pid } = isServiceRunning('cron');
    if (running) {
      console.log(`\n  Cron: ${chalk.green('running')} (PID ${pid})\n`);
    } else {
      console.log(`\n  Cron: ${chalk.dim('stopped')}\n`);
    }
  });

cronCmd
  .command('list')
  .description('List all cron jobs')
  .action(async () => {
    const chalk = (await import('chalk')).default;
    const { loadJobs } = await import('../src/cron/jobs.js');
    const jobs = loadJobs();

    if (jobs.length === 0) {
      console.log('\n  No cron jobs configured.');
      console.log('  Use "anya cron add" to create one.\n');
      return;
    }

    console.log(`\n  ${chalk.bold('Cron Jobs')} (${jobs.length})\n`);
    for (const job of jobs) {
      const status = job.enabled ? chalk.green('on') : chalk.dim('off');
      console.log(`  [${status}] ${chalk.cyan(job.id)} - ${job.name}`);
      console.log(`       ${chalk.dim(job.schedule)} -> ${job.deliver_to}`);
    }
    console.log('');
  });

cronCmd
  .command('add')
  .description('Add a new cron job')
  .action(async () => {
    const { input: promptInput } = await import('@inquirer/prompts');
    const { addJob } = await import('../src/cron/jobs.js');

    const id = await promptInput({ message: 'Job ID (kebab-case):' });
    const name = await promptInput({ message: 'Job name:' });
    const schedule = await promptInput({ message: 'Cron schedule (e.g. "0 9 * * *"):' });
    const prompt = await promptInput({ message: 'Prompt for the agent:' });
    const deliverTo = await promptInput({ message: 'Deliver to (cli/telegram):', default: 'telegram' });

    addJob({
      id: id.trim(),
      name: name.trim(),
      schedule: schedule.trim(),
      prompt: prompt.trim(),
      deliver_to: deliverTo.trim() as 'cli' | 'telegram',
      enabled: true,
      created_at: new Date().toISOString(),
    });

    console.log(`\n  [ok] Job "${id.trim()}" added.\n`);
  });

cronCmd
  .command('remove <id>')
  .description('Remove a cron job')
  .action(async (id: string) => {
    const { removeJob } = await import('../src/cron/jobs.js');
    const removed = removeJob(id);
    console.log(removed ? `\n  [ok] Job "${id}" removed.\n` : `\n  Job "${id}" not found.\n`);
  });

cronCmd
  .command('run <id>')
  .description('Run a cron job manually')
  .action(async (id: string) => {
    const chalk = (await import('chalk')).default;
    const { runJobManually } = await import('../src/cron/scheduler.js');
    try {
      console.log(chalk.dim(`\n  Running job "${id}"...\n`));
      const result = await runJobManually(id);
      console.log(result);
      console.log('');
    } catch (err) {
      console.error(`\n  Error: ${(err as Error).message}\n`);
      process.exit(1);
    }
  });

// --- anya sessions ---
const sessionsCmd = program
  .command('sessions')
  .description('Manage chat sessions');

sessionsCmd
  .command('list')
  .description('List recent sessions')
  .option('-n, --limit <n>', 'Number of sessions to show', '20')
  .action(async (opts: { limit: string }) => {
    const chalk = (await import('chalk')).default;
    const { listSessions } = await import('../src/storage/sessionStore.js');
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
  .action(async (query: string) => {
    const chalk = (await import('chalk')).default;
    const { searchMessages } = await import('../src/storage/sessionStore.js');
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

// --- anya export ---
program
  .command('export <file>')
  .description('Export ~/.anya/ data')
  .option('--soul', 'Export soul layer only (config, memory, skills, cron)')
  .action(async (file: string, opts: { soul?: boolean }) => {
    const { execSync } = await import('node:child_process');
    const { ANYA_HOME } = await import('../src/lib/paths.js');

    if (opts.soul) {
      execSync(
        `tar -czf "${file}" -C "${ANYA_HOME}" config.json config.schema.json memory/ skills/ cron/jobs.json 2>/dev/null || true`,
        { stdio: 'inherit' },
      );
    } else {
      execSync(`tar -czf "${file}" -C "${ANYA_HOME}" .`, { stdio: 'inherit' });
    }

    console.log(`\n  [ok] Exported to ${file}\n`);
  });

// --- anya import ---
program
  .command('import <file>')
  .description('Import from a backup')
  .action(async (file: string) => {
    const { execSync } = await import('node:child_process');
    const { ANYA_HOME, ensureDirectories } = await import('../src/lib/paths.js');

    ensureDirectories();
    execSync(`tar -xzf "${file}" -C "${ANYA_HOME}"`, { stdio: 'inherit' });
    console.log(`\n  [ok] Imported from ${file}\n`);
  });

// Parse and run
program.parse();
