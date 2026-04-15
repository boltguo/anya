/**
 * @module commands/config/helpers
 * @description Cross-section helpers used by every `anya config` subcommand.
 */

import chalk from 'chalk';
import type { AnyaConfig } from '../../config/defaults.js';

export function getActiveModel(config: AnyaConfig): string {
  return config.provider.active === 'openai'
    ? config.provider.openai.model
    : config.provider.gemini.model;
}

export function hasVisionKey(config: AnyaConfig): boolean {
  return !!(config.vision?.gemini_api_key || config.provider?.gemini?.api_key);
}

export function maskKey(key: string): string {
  if (key.length <= 8) return '****';
  return key.substring(0, 4) + '****' + key.substring(key.length - 4);
}

/**
 * Restart the Telegram gateway only if it is already running. Silent failure
 * is intentional — the user may be configuring without the gateway up.
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
