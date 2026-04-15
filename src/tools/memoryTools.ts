/**
 * @module tools/memoryTools
 * @description Long-term memory tools for USER.md and MEMORY.md.
 *
 * Allows the agent to persist user profile notes (USER.md) and its own
 * notes (MEMORY.md) across sessions. These files are injected into the
 * system prompt on every conversation.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { register } from './registry.js';
import { USER_MD_PATH, MEMORY_MD_PATH } from '../lib/paths.js';
import type { ToolContext } from '../agent/types.js';

// --- memory_update ---
register({
  name: 'memory_update',
  description: 'Update the agent\'s long-term memory. Can update USER.md (user profile) or MEMORY.md (agent notes). Content is automatically loaded at the start of every conversation.',
  parameters: {
    type: 'object',
    properties: {
      target: {
        type: 'string',
        description: 'Which memory file to update: "user" (user profile) or "memory" (agent notes)',
        enum: ['user', 'memory'],
      },
      action: {
        type: 'string',
        description: 'Update mode: "append" (add content) or "replace" (overwrite entire file)',
        enum: ['append', 'replace'],
      },
      content: {
        type: 'string',
        description: 'Content to write (markdown format)',
      },
    },
    required: ['target', 'action', 'content'],
  },

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<string> {
    const target = String(args.target);
    const action = String(args.action);
    const content = String(args.content);

    const filePath = target === 'user' ? USER_MD_PATH : MEMORY_MD_PATH;
    const fileName = target === 'user' ? 'USER.md' : 'MEMORY.md';

    try {
      const dir = dirname(filePath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

      if (action === 'replace') {
        writeFileSync(filePath, content, 'utf-8');
        return `Successfully replaced ${fileName}.`;
      }

      // append
      const existing = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : '';
      const separator = existing.endsWith('\n') || existing === '' ? '' : '\n';
      writeFileSync(filePath, existing + separator + content + '\n', 'utf-8');
      return `Successfully appended to ${fileName}.`;

    } catch (err) {
      return `Error updating ${fileName}: ${(err as Error).message}`;
    }
  },
});
