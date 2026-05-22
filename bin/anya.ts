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

program
  .command('usage')
  .description('Show monthly API usage statistics')
  .option('-m, --month <YYYY-MM>', 'Show a specific month (default: current)')
  .action((options) => {
    runUsage(options.month);
  });

program.parse();
