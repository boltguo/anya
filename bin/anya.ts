#!/usr/bin/env node

// Suppress node:sqlite ExperimentalWarning (expected on Node 22)
const _emit = process.emit;
// @ts-expect-error -- patching process.emit to filter warnings
process.emit = function (event: string, ...args: unknown[]) {
  if (event === 'warning') {
    const warning = args[0] as { name?: string; message?: string } | undefined;
    if (warning?.name === 'ExperimentalWarning' && warning.message?.includes('SQLite')) {
      return false;
    }
  }
  return _emit.apply(process, [event, ...args] as Parameters<typeof _emit>);
};

import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { registerDoctor } from './commands/doctor.js';
import { registerConfig } from './commands/config.js';
import { registerSkills } from './commands/skills.js';
import { registerGateway } from './commands/gateway.js';
import { registerCron } from './commands/cron.js';
import { registerSessions } from './commands/sessions.js';
import { registerDataTransfer } from './commands/dataTransfer.js';

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

// Small inline commands kept here; subcommand trees live in ./commands/.

program
  .command('init')
  .description('Initialize ~/.anya/ directory and configuration')
  .action(async () => {
    const { runInit } = await import('../src/commands/init.js');
    await runInit();
  });

program
  .command('chat')
  .description('Send a single message to the agent and print the response')
  .argument('[message]', 'Message to send', 'Hello, who are you?')
  .action(async (message: string) => {
    const { runChat } = await import('../src/commands/chat.js');
    await runChat(message);
  });

registerConfig(program);
registerDoctor(program);
registerSkills(program);
registerGateway(program);
registerCron(program);
registerSessions(program);
registerDataTransfer(program);

program
  .command('usage')
  .description('Show monthly API usage statistics')
  .option('-m, --month <YYYY-MM>', 'Show a specific month (default: current)')
  .action(async (options) => {
    const { runUsage } = await import('../src/commands/usage.js');
    runUsage(options.month);
  });

program.parse();
