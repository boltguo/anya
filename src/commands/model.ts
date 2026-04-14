/**
 * @module commands/model
 * @description `anya model` — Switch model provider.
 *
 * Re-runs the provider selection flow (same UI as anya init step 1).
 * After switching, auto-restarts the gateway if running.
 */

import chalk from 'chalk';
import { loadConfig } from '../config/loader.js';
import { selectProvider } from './providerSelect.js';

/**
 * Run the model switch command.
 */
export async function runModelSelect(): Promise<void> {
  console.log();
  console.log(chalk.bold.cyan('Anya Model'));
  console.log(chalk.dim('  Switch model provider\n'));

  const config = loadConfig();
  await selectProvider(config);

  console.log(chalk.green('\n  [ok] Provider updated.\n'));

  // Auto-restart gateway if running
  try {
    const { isServiceRunning } = await import('../lib/pidfile.js');
    const { running } = isServiceRunning('gateway');
    if (running) {
      console.log(chalk.dim('  Restarting gateway...'));
      const { runGatewayRestart } = await import('./gateway.js');
      await runGatewayRestart();
    }
  } catch {
    // Non-critical
  }
}
