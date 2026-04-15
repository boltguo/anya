/**
 * @module commands/config/azure
 * @description Azure Speech Service configuration wizard.
 *
 * Configures the speech key and region for pronunciation assessment.
 */

import { select, input } from '@inquirer/prompts';
import chalk from 'chalk';
import { writeFileSync } from 'node:fs';
import { CONFIG_PATH } from '../../lib/paths.js';
import type { AnyaConfig } from '../../config/defaults.js';
import { maskKey, autoRestartGateway } from './helpers.js';

const REGIONS = [
  { name: 'East Asia (eastasia)',           value: 'eastasia' },
  { name: 'Southeast Asia (southeastasia)', value: 'southeastasia' },
  { name: 'East US (eastus)',               value: 'eastus' },
  { name: 'West Europe (westeurope)',       value: 'westeurope' },
  { name: 'Other (enter manually)',         value: '__custom__' },
];

export async function configAzure(config: AnyaConfig): Promise<void> {
  const currentKey = config.azure?.speech_key || '';
  const currentRegion = config.azure?.speech_region || 'eastasia';

  if (currentKey) {
    console.log(chalk.dim(`\n  Key:    ${maskKey(currentKey)}`));
    console.log(chalk.dim(`  Region: ${currentRegion}\n`));

    const action = await select({
      message: 'Azure Speech settings',
      choices: [
        { name: 'Change region only', value: 'region' },
        { name: 'Full setup (key + region)', value: 'full' },
        { name: 'Cancel', value: 'cancel' },
      ],
    });

    if (action === 'cancel') return;

    if (action === 'region') {
      const region = await selectRegion(currentRegion);
      config.azure = { speech_key: currentKey, speech_region: region };
      writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
      console.log(chalk.green(`\n  [ok] Azure region → ${region}`));
      await autoRestartGateway();
      return;
    }
  }

  console.log();
  console.log(chalk.dim('  Azure Speech is used for pronunciation assessment.'));
  console.log(chalk.dim('  Get a key: https://portal.azure.com/ → Speech Services\n'));

  const speechKey = await input({
    message: 'Azure Speech Key:',
    default: currentKey || undefined,
  });

  if (!speechKey.trim()) {
    console.log(chalk.yellow('\n  Skipped. Pronunciation assessment will be unavailable.'));
    return;
  }

  const region = await selectRegion(currentRegion);

  config.azure = { speech_key: speechKey.trim(), speech_region: region };
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');

  console.log(chalk.green('\n  [ok] Azure Speech configured.'));
  console.log(chalk.dim(`  Region: ${region}`));
  await autoRestartGateway();
}

async function selectRegion(currentRegion: string): Promise<string> {
  let region = await select({
    message: 'Azure Region',
    choices: REGIONS,
    default: REGIONS.find(r => r.value === currentRegion) ? currentRegion : '__custom__',
  });

  if (region === '__custom__') {
    region = await input({
      message: 'Enter Azure region:',
      default: currentRegion,
    });
  }

  return region.trim() || 'eastasia';
}
