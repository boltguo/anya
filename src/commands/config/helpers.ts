/**
 * @module commands/config/helpers
 * @description Cross-section helpers used by every `anya config` subcommand.
 */

import chalk from 'chalk';

export function maskKey(key: string): string {
  if (key.length <= 8) return '****';
  return key.substring(0, 4) + '****' + key.substring(key.length - 4);
}

/**
 * Restart the Telegram gateway only if it is already running.
 */
export async function autoRestartGateway(): Promise<void> {
  try {
    const { isServiceRunning } = await import('../../lib/pidfile.js');
    const { running } = isServiceRunning('gateway');
    if (running) {
      console.log(chalk.dim('  Restarting gateway...'));
      const { runGatewayRestart } = await import('../gateway.js');
      await runGatewayRestart();
    }
  } catch {
    // Non-critical
  }
}
