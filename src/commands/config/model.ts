/**
 * @module commands/config/model
 * @description Interactive model configuration wizard.
 *
 * Allows switching between Gemini and OpenAI providers, selecting models,
 * and updating API keys. Auto-restarts the gateway if it's running.
 */

import chalk from 'chalk';
import type { AnyaConfig } from '../../config/defaults.js';
import { autoRestartGateway } from './helpers.js';

export async function configModel(config: AnyaConfig): Promise<void> {
  const { selectProvider } = await import('../providerSelect.js');
  await selectProvider(config);
  console.log(chalk.green('\n  [ok] Provider updated.'));
  await autoRestartGateway();
}
