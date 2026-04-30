/**
 * @module tools/resetContext
 * @description Context resetting tool.
 * Allows the agent to explicitly clear working memory to save context limits and reset state.
 */

import { register } from './registry.js';

register({
  name: 'reset_context',
  description: 'Clear the conversation history. Use this when a distinct task (e.g., a practice session) is completely finished and the user is moving to a completely new topic. This saves tokens and helps you focus. You can provide an optional summary of important facts to carry over.',
  parameters: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description: 'A brief summary of important facts or conclusions from the finished task to keep in mind for the future. Leave empty if nothing needs to be carried over.',
      },
    },
  },
  async execute(args: { summary?: string }): Promise<string> {
    const summary = args.summary?.trim();
    if (summary) {
      return `[Context Reset] History cleared. Carried over summary: ${summary}`;
    }
    return `[Context Reset] History cleared.`;
  }
});
