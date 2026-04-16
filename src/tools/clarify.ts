/**
 * @module tools/clarifyTools
 * @description Clarification tool for multi-step user interaction.
 *
 * On Telegram, presents choices as native inline keyboard buttons via
 * {@link requestChoice}. On CLI, falls back to text-based prompts.
 * Used when the agent needs the user to pick between options.
 */

import { register } from './registry.js';
import type { ToolContext } from '../agent/types.js';

// --- clarify ---
register({
  name: 'clarify',
  description: 'Ask the user to pick from a set of choices via native UI (e.g., inline keyboards). Use this when you have 2-5 clear structural options.',
  parameters: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'The question or prompt to show above the buttons.',
      },
      options: {
        type: 'array',
        items: { type: 'string' },
        description: 'The list of choice strings to present as buttons.',
      },
    },
    required: ['message', 'options'],
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<string> {
    const message = String(args.message);
    const options = (args.options as unknown[])?.map(String) || [];

    if (!context.adapter.requestChoice) {
      return `Error: The current adapter does not support native choices. You must manually ask the user to type out their choice.`;
    }

    if (options.length === 0) {
      return `Error: You must provide at least one option.`;
    }

    const choice = await context.adapter.requestChoice(message, options);
    
    if (!choice) {
      return `User did not respond within the timeout or cancelled.`;
    }

    return `User selected: ${choice}`;
  },
});
