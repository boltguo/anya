#!/usr/bin/env node
// bin/anya.ts — Commander CLI entrypoint for Anya agent

import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

import { runInit } from '../src/commands/init.js';
import { runUsage } from '../src/commands/usage.js';
import { runConfigMenu, runConfigShow } from '../src/commands/config.js';
import { runDoctor } from '../src/commands/doctor.js';
import {
  runGatewayStart,
  runGatewayStop,
  runGatewayRestart,
  runGatewayStatus,
  runGatewayLogs,
} from '../src/commands/gateway.js';
import {
  runCronCreate,
  runCronEnable,
  runCronList,
  runCronPause,
  runCronRemove,
  runCronResume,
  runCronRun,
  runCronSetChat,
  runCronSetTick,
  runCronStatus,
  runCronTick,
  runCronUpdate,
} from '../src/commands/cron.js';
import { CONFIG_PATH } from '../src/lib/paths.js';

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
  .addHelpCommand(false)
  .action(() => {
    program.outputHelp();
  });

program
  .command('init')
  .description('Initialize ~/.anya/ directory and configuration')
  .action(async () => {
    await runInit();
  });

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

program
  .command('doctor')
  .description('Check environment and configuration')
  .action(async () => {
    await runDoctor();
  });

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

const cronCmd = program
  .command('cron')
  .description('Manage scheduled jobs');

cronCmd
  .command('status')
  .description('Show cron configuration and job count')
  .action(() => {
    runCronStatus();
  });

cronCmd
  .command('enable')
  .description('Enable background cron ticking in the gateway')
  .action(() => {
    runCronEnable(true);
  });

cronCmd
  .command('disable')
  .description('Disable background cron ticking in the gateway')
  .action(() => {
    runCronEnable(false);
  });

cronCmd
  .command('set-chat <chatId>')
  .description('Set the default Telegram chat ID for cron delivery')
  .action((chatId: string) => {
    runCronSetChat(chatId);
  });

cronCmd
  .command('set-tick <seconds>')
  .description('Set the scheduler polling interval')
  .action((seconds: string) => {
    runCronSetTick(Number(seconds));
  });

cronCmd
  .command('list')
  .description('List scheduled jobs')
  .action(() => {
    runCronList();
  });

cronCmd
  .command('create')
  .description('Create a scheduled job')
  .requiredOption('-n, --name <name>', 'Job name')
  .requiredOption('-s, --schedule <schedule>', '30m, every 2h, ISO timestamp, or cron expression')
  .requiredOption('-p, --prompt <prompt>', 'Unattended job prompt')
  .option('-c, --chat <chatId>', 'Telegram chat id')
  .option('-r, --repeat <n>', 'Maximum run count')
  .option('--paused', 'Create the job paused')
  .action((opts: { name: string; schedule: string; prompt: string; chat?: string; repeat?: string; paused?: boolean }) => {
    runCronCreate(opts);
  });

cronCmd
  .command('update <id>')
  .description('Update a scheduled job')
  .option('-n, --name <name>', 'Job name')
  .option('-s, --schedule <schedule>', '30m, every 2h, ISO timestamp, or cron expression')
  .option('-p, --prompt <prompt>', 'Unattended job prompt')
  .option('-c, --chat <chatId>', 'Telegram chat id')
  .option('-r, --repeat <n>', 'Maximum run count')
  .action((id: string, opts: { name?: string; schedule?: string; prompt?: string; chat?: string; repeat?: string }) => {
    runCronUpdate(id, opts);
  });

cronCmd
  .command('pause <id>')
  .description('Pause a scheduled job')
  .action((id: string) => {
    runCronPause(id);
  });

cronCmd
  .command('resume <id>')
  .description('Resume a scheduled job')
  .action((id: string) => {
    runCronResume(id);
  });

cronCmd
  .command('remove <id>')
  .description('Remove a scheduled job')
  .action((id: string) => {
    runCronRemove(id);
  });

cronCmd
  .command('run <id>')
  .description('Run a scheduled job now')
  .option('--no-deliver', 'Do not send proactive Telegram output')
  .action(async (id: string, opts: { deliver: boolean }) => {
    await runCronRun(id, opts.deliver);
  });

cronCmd
  .command('tick')
  .description('Run one scheduler tick now')
  .option('--no-deliver', 'Do not send proactive Telegram output')
  .action(async (opts: { deliver: boolean }) => {
    await runCronTick(opts.deliver);
  });

program
  .command('usage')
  .description('Show monthly API usage statistics')
  .option('-m, --month <YYYY-MM>', 'Show a specific month (default: current)')
  .action((options) => {
    runUsage(options.month);
  });

program.parse();
