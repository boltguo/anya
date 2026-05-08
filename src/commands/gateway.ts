/**
 * @module commands/gateway
 * @description `anya gateway` — Telegram bot process manager.
 *
 * Controls the long-running process that connects to Telegram via Grammy's
 * long-polling mechanism. It supports running in the foreground (useful for
 * debugging) or being spawned as a detached background child process. When running
 * in the background, `stdout` and `stderr` are redirected to `~/.anya/logs/gateway.log`.
 *
 * Provides commands to start, stop, restart, check the status of, and tail the logs
 * of the gateway process.
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
 * Starts the Telegram gateway.
 *
 * By default, it spawns a detached background child process. If `_bgChild` is true,
 * it runs the adapter directly in the current process (used internally when spawned).
 *
 * @param _bgChild - Internal flag indicating this process was spawned as the background worker.
 * @returns A Promise resolving when the gateway is successfully started or spawned.
 */
export async function runGatewayStart(_bgChild = false): Promise<void> {
  const { running, pid } = isServiceRunning(SERVICE);
  if (running) {
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
    // Internal: The spawned child process executes the adapter directly.
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
    // Default: Spawn a detached background child process.
    const { spawn } = await import('node:child_process');
    const { openSync } = await import('node:fs');

    const logFd = openSync(LOG_PATH, 'a');

    // Resolves the entry script and runtime execution environment.
    // In development mode (tsx), we spawn via `npx tsx`. In production, we use Node natively.
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
 * Stops the running background gateway process.
 * Reads the stored PID file and sends a termination signal to the process.
 *
 * @returns A Promise resolving when the gateway is successfully stopped.
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
 * Checks and outputs the current running status of the gateway process.
 * Verifies the PID file and ensures the corresponding process is still active.
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
 * Restarts the gateway process by stopping it and then starting a new instance.
 *
 * @returns A Promise resolving when the gateway has been successfully restarted.
 */
export async function runGatewayRestart(): Promise<void> {
  await runGatewayStop();
  await runGatewayStart();
}

/**
 * Tails the gateway log file, displaying the most recent lines.
 *
 * @param lines - The maximum number of log lines to display (default: 50).
 */
export function runGatewayLogs(lines = 50): void {
  if (!existsSync(LOG_PATH)) {
    console.log('\n  No gateway logs found.\n');
    return;
  }

  // Simplified tail implementation reading from the end of the log file.
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
