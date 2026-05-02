/**
 * @module commands/gateway
 * @description Telegram bot process manager (start, stop, restart, status, logs).
 *
 * The "gateway" is the long-running process that connects to Telegram via
 * grammy's long-polling. It can run in foreground (for debugging) or be
 * spawned as a detached background child process with stdout/stderr
 * redirected to ~/.anya/logs/gateway.log.
 */

import { createReadStream, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import chalk from 'chalk';
import { isServiceRunning, stopService, writePid, removePid } from '../lib/pidfile.js';
import { LOGS_DIR, ensureDirectories } from '../lib/paths.js';
import { loadConfig } from '../config/loader.js';

const SERVICE = 'gateway';
const LOG_PATH = join(LOGS_DIR, 'gateway.log');

/**
 * Start the Telegram gateway in the background (or foreground).
 */
export async function runGatewayStart(_bgChild = false): Promise<void> {
  const { running, pid } = isServiceRunning(SERVICE);
  if (running) {
    console.log(`\n  Gateway is already running (PID ${pid}).`);
    console.log(`  Run "anya gateway restart" to restart.\n`);
    return;
  }

  const config = loadConfig();
  if (!config.telegram?.enabled && !config.feishu?.enabled) {
    console.log('\n  Neither Telegram nor Feishu is configured.');
    console.log('  Run "anya init" or set telegram.enabled=true / feishu.enabled=true in config.\n');
    return;
  }

  ensureDirectories();

  if (_bgChild) {
    // Internal: spawned child process runs the adapter directly
    writePid(SERVICE);

    process.on('SIGINT', () => {
      removePid(SERVICE);
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      removePid(SERVICE);
      process.exit(0);
    });

    const startups: Promise<void>[] = [];

    if (config.telegram?.enabled && config.telegram?.bot_token) {
      const { TelegramAdapter } = await import('../adapters/telegram.js');
      const adapter = new TelegramAdapter(config);
      startups.push(adapter.start());
    }

    if (config.feishu?.enabled && config.feishu?.app_id && config.feishu?.app_secret) {
      const { FeishuAdapter } = await import('../adapters/feishu/FeishuAdapter.js');
      const adapter = new FeishuAdapter(config);
      startups.push(adapter.start());
    }
    
    await Promise.all(startups);
  } else {
    // Default: spawn a detached background child process
    const { spawn } = await import('node:child_process');
    const { openSync } = await import('node:fs');

    const logFd = openSync(LOG_PATH, 'a');

    // Resolve the entry script and runner.
    // In dev mode (tsx), we need to spawn via npx tsx; in production, use node directly.
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

/**
 * Stop the gateway.
 */
export async function runGatewayStop(): Promise<void> {
  const stopped = await stopService(SERVICE);
  if (stopped) {
    console.log('\n  [ok] Gateway stopped.\n');
  } else {
    console.log('\n  Gateway is not running.\n');
  }
}

/**
 * Show gateway status.
 */
export function runGatewayStatus(): void {
  const { running, pid } = isServiceRunning(SERVICE);
  if (running) {
    console.log(`\n  Gateway: ${chalk.green('running')} (PID ${pid})\n`);
  } else {
    console.log(`\n  Gateway: ${chalk.dim('stopped')}\n`);
  }
}

/**
 * Restart the gateway.
 */
export async function runGatewayRestart(): Promise<void> {
  await runGatewayStop();
  await runGatewayStart();
}

/**
 * Tail gateway logs.
 */
export function runGatewayLogs(lines = 50): void {
  if (!existsSync(LOG_PATH)) {
    console.log('\n  No gateway logs found.\n');
    return;
  }

  // Simple tail implementation
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
