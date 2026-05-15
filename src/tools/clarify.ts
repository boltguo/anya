// tools/clarify.ts — native-UI choice prompt

import { register } from './registry.js';
import type { ToolContext } from '../agent/types.js';

register({
  name: 'clarify',
  description: 'Ask the user to pick from a set of choices via native UI (e.g., inline keyboards). Use this when you have 2-5 clear structural options.',
  parameters: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'The primary contextual question to render above the structural choices.',
      },
      options: {
        type: 'array',
        items: { type: 'string' },
        description: 'An array of distinct choice strings rendered as selectable buttons.',
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
