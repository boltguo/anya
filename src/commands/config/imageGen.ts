/**
 * @module commands/config/imageGen
 * @description Image generation configuration wizard.
 *
 * Configures backend (Vertex AI / AI Studio), model, aspect ratio,
 * and Vertex project settings for the image_gen tool.
 */

import { select, input } from '@inquirer/prompts';
import chalk from 'chalk';
import { writeFileSync } from 'node:fs';
import { CONFIG_PATH } from '../../lib/paths.js';
import type { AnyaConfig } from '../../config/defaults.js';
import { autoRestartGateway } from './helpers.js';

const IMAGE_MODELS = [
  { name: 'Gemini 3.1 Flash Image  (Nano Banana 2, recommended)', value: 'gemini-3.1-flash-image-preview' },
  { name: 'Gemini 3 Pro Image  (highest quality)',                 value: 'gemini-3-pro-image-preview' },
];

const ASPECT_RATIOS = [
  { name: '1:1  (square)',     value: '1:1' },
  { name: '16:9  (landscape)', value: '16:9' },
  { name: '9:16  (portrait)',  value: '9:16' },
  { name: '4:3',               value: '4:3' },
  { name: '3:4',               value: '3:4' },
];

export async function configImageGen(config: AnyaConfig): Promise<void> {
  const currentBackend = config.image_gen?.backend || 'vertex';
  const currentModel = config.image_gen?.model || 'gemini-3.1-flash-image-preview';
  const currentRatio = config.image_gen?.aspect_ratio || '1:1';
  const currentProject = config.vertex?.project || '';
  const currentLocation = config.vertex?.location || 'global';

  console.log(chalk.dim(`\n  Current: ${currentBackend} / ${currentModel} / ${currentRatio}`));
  if (currentBackend === 'vertex') {
    console.log(chalk.dim(`  Vertex:  ${currentProject || '(not set)'} @ ${currentLocation}`));
  }
  console.log();

  // 1. Choose backend
  const backend = await select({
    message: 'Image Generation Backend',
    choices: [
      { name: 'Vertex AI  (uses GCP credits, ADC auth)',      value: 'vertex' as const },
      { name: 'AI Studio  (uses global Gemini API key, free)', value: 'ai_studio' as const },
    ],
    default: currentBackend,
  });

  // 2. If Vertex, configure project
  let project = currentProject;
  let location = currentLocation;
  if (backend === 'vertex') {
    project = await input({
      message: 'GCP Project ID:',
      default: currentProject || undefined,
    });
    project = project.trim();

    if (!project) {
      console.log(chalk.yellow('\n  ⚠ Vertex AI requires a project ID. Aborting.'));
      return;
    }

    location = await input({
      message: 'GCP Region:',
      default: currentLocation,
    });
    location = location.trim() || 'global';

    config.vertex = { project, location };
  }

  // 3. Choose model
  const model = await select({
    message: 'Image Model',
    choices: IMAGE_MODELS,
    default: currentModel,
  });

  // 4. Choose default aspect ratio
  const aspectRatio = await select({
    message: 'Default Aspect Ratio',
    choices: ASPECT_RATIOS,
    default: currentRatio,
  });

  config.image_gen = { backend, model, aspect_ratio: aspectRatio };

  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');

  console.log(chalk.green('\n  [ok] Image Generation configured.'));
  console.log(chalk.dim(`  Backend: ${backend}`));
  console.log(chalk.dim(`  Model:   ${model}`));
  console.log(chalk.dim(`  Ratio:   ${aspectRatio}`));
  if (backend === 'vertex') {
    console.log(chalk.dim(`  Project: ${project} @ ${location}`));
  }

  await autoRestartGateway();
}
