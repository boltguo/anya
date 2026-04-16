/**
 * @module tools/memory
 * @description Proactive memory tool — structured long-term memory.
 *
 * The agent uses this tool to remember important information about the user,
 * things it has learned, and current context. Memories persist across sessions
 * and are automatically injected into the system prompt.
 *
 * The agent should proactively save memories when it learns something new
 * about the user or discovers something worth remembering.
 */

import { register } from './registry.js';
import { memorySave, memorySearch, memoryList, memoryDelete, loadMemories } from '../lib/memory.js';
import type { MemoryType } from '../lib/memory.js';
import type { ToolContext } from '../agent/types.js';

register({
  name: 'memory',
  description: `Manage long-term memories. Proactively save important info about the user, things you've learned, and current context.

Types:
- "user": Facts about the user (name, language, preferences, habits, schedule)
- "learned": Things you learned or were corrected on (user's coding style, preferred tools, etc.)
- "context": Ongoing context (current projects, goals, deadlines)

IMPORTANT: You should proactively save memories whenever you learn something new about the user. Don't wait to be asked.`,
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'Action: "save", "search", "list", or "delete"',
        enum: ['save', 'search', 'list', 'delete'],
      },
      type: {
        type: 'string',
        description: 'Memory type: "user", "learned", or "context"',
        enum: ['user', 'learned', 'context'],
      },
      content: {
        type: 'string',
        description: 'For save: the content to remember. For search: the search query.',
      },
      id: {
        type: 'string',
        description: 'For delete: the memory ID to remove.',
      },
    },
    required: ['action'],
  },

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<string> {
    const action = String(args.action);

    switch (action) {
      case 'save': {
        const type = String(args.type || 'learned') as MemoryType;
        const content = String(args.content || '');
        if (!content) return 'Error: content is required for save.';
        if (!['user', 'learned', 'context'].includes(type)) {
          return 'Error: type must be "user", "learned", or "context".';
        }

        const entry = memorySave(type, content);
        return `Saved memory [${entry.id}] (${type}): "${content.slice(0, 60)}${content.length > 60 ? '...' : ''}"`;
      }

      case 'search': {
        const query = String(args.content || '');
        if (!query) return 'Error: content (search query) is required.';
        const type = args.type ? String(args.type) as MemoryType : undefined;
        const results = memorySearch(query, type);
        if (results.length === 0) return `No memories found matching "${query}".`;
        return results.map(e =>
          `[${e.id}] (${e.type}) ${e.content}`
        ).join('\n');
      }

      case 'list': {
        const type = args.type ? String(args.type) as MemoryType : undefined;
        const entries = memoryList(type);
        if (entries.length === 0) return type ? `No ${type} memories.` : 'No memories saved yet.';
        return entries.map(e =>
          `[${e.id}] (${e.type}) ${e.content}`
        ).join('\n');
      }

      case 'delete': {
        const id = String(args.id || '');
        if (!id) return 'Error: id is required for delete.';
        const ok = memoryDelete(id);
        return ok ? `Deleted memory [${id}].` : `Memory [${id}] not found.`;
      }

      default:
        return `Error: Unknown action "${action}". Use save, search, list, or delete.`;
    }
  },
});
