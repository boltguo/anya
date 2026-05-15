// commands/gateway.ts — Telegram bot process manager

import { createReadStream, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import chalk from 'chalk';
import { isServiceRunning, stopService, writePid, removePid, killStrayServiceProcesses } from '../lib/pidfile.js';
import { LOGS_DIR, ensureDirectories } from '../lib/paths.js';
import { loadConfig } from '../config/loader.js';

const SERVICE = 'gateway';
const LOG_PATH = join(LOGS_DIR, 'gateway.log');

export async function runGatewayStart(_bgChild = false): Promise<void> {
  const { running, pid } = isServiceRunning(SERVICE);
  if (running && !_bgChild) {
    console.log(`\n  Gateway is already running (PID ${pid}).`);
    console.log(`  Run "anya gateway restart" to restart.\n`);
    return;
  }

  const config = loadConfig();
  if (!config.telegram.enabled || !config.telegram.bot_token) {
    console.log('\n  Telegram is not configured.');
    console.log('  Run "anya init" or set telegram.enabled=true and telegram.bot_token in config.\n');
    return;
  }

  ensureDirectories();

  if (_bgChild) {
    // Reap any prior gateway (orphaned pid file, /restart predecessor, or stale daemon)
    // before we claim the pid file. Wait until they're dead so writePid is the last writer.
    const killed = await killStrayServiceProcesses(SERVICE);
    if (killed.length > 0) {
      console.log(`  [gateway] Reaped ${killed.length} stray process(es): ${killed.join(', ')}`);
    }

    writePid(SERVICE);

    process.on('SIGINT', () => {
      removePid(SERVICE);
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      removePid(SERVICE);
      process.exit(0);
    });

    const { TelegramAdapter } = await import('../adapters/telegram.js');
    const adapter = new TelegramAdapter(config);
    await adapter.start();
  } else {
    // Defensive: kill orphans whose pid file was lost/corrupted before we spawn the child.
    await killStrayServiceProcesses(SERVICE);

    const { spawn } = await import('node:child_process');
    const { openSync } = await import('node:fs');

    const logFd = openSync(LOG_PATH, 'a');

    // dev mode (tsx) spawns via `npx tsx`; prod uses node directly
    const anyaBin = process.argv[1];
    const isTsx = process.argv[0].includes('tsx') || anyaBin.endsWith('.ts');
    const execPath = isTsx ? 'npx' : process.execPath;
    const execArgs = isTsx
      ? ['tsx', anyaBin, 'gateway', 'start', '--_bg_child']
      : [anyaBin, 'gateway', 'start', '--_bg_child'];

    const child = spawn(execPath, execArgs, {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      env: { ...process.env },
    });

    child.unref();

    console.log(chalk.bold('\n  [gateway] Started in background.'));
    console.log(`  PID: ${child.pid}`);
    console.log(`  Logs: ${LOG_PATH}`);
    console.log(`  Stop: anya gateway stop\n`);

    process.exit(0);
  }
}

export async function runGatewayStop(): Promise<void> {
  const stopped = await stopService(SERVICE);
  if (stopped) {
    console.log('\n  [ok] Gateway stopped.\n');
  } else {
    console.log('\n  Gateway is not running.\n');
  }
}

export function runGatewayStatus(): void {
  const { running, pid } = isServiceRunning(SERVICE);
  if (running) {
    console.log(`\n  Gateway: ${chalk.green('running')} (PID ${pid})\n`);
  } else {
    console.log(`\n  Gateway: ${chalk.dim('stopped')}\n`);
  }
}

export async function runGatewayRestart(): Promise<void> {
  await runGatewayStop();
  await runGatewayStart();
}

export function runGatewayLogs(lines = 50): void {
  if (!existsSync(LOG_PATH)) {
    console.log('\n  No gateway logs found.\n');
    return;
  }

  const allLines: string[] = [];
  const rl = createInterface({
    input: createReadStream(LOG_PATH, { encoding: 'utf-8' }),
  });

  rl.on('line', (line) => {
    allLines.push(line);
    if (allLines.length > lines) allLines.shift();
  });

  rl.on('close', () => {
    console.log(`\n  Gateway Logs (last ${lines} lines)\n`);
    for (const line of allLines) {
      try {
        const parsed = JSON.parse(line);
        const time = new Date(parsed.time).toISOString();
        const level = parsed.level <= 30 ? chalk.dim('INFO') : parsed.level <= 40 ? chalk.yellow('WARN') : chalk.red('ERROR');
        console.log(`  ${chalk.dim(time)} ${level} ${parsed.msg || ''}`);
      } catch {
        console.log(`  ${line}`);
      }
    }
    console.log('');
  });
}
