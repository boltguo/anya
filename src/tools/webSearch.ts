import { register } from './registry.js';
import type { ToolContext } from '../agent/types.js';

/**
 * Tavily API search.
 * Docs: https://docs.tavily.com/
 */
async function tavilySearch(
  query: string,
  maxResults: number,
  apiKey: string,
): Promise<string> {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: maxResults,
      include_answer: true,
      include_raw_content: false,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Tavily API error (${response.status}): ${text}`);
  }

  const data = await response.json() as {
    answer?: string;
    results?: Array<{
      title: string;
      url: string;
      content: string;
    }>;
  };

  // Format results as clean markdown
  const lines: string[] = [];

  if (data.answer) {
    lines.push(`**Summary:** ${data.answer}\n`);
  }

  if (data.results) {
    lines.push('**Sources:**\n');
    for (const [i, result] of data.results.entries()) {
      lines.push(`${i + 1}. **${result.title}**`);
      lines.push(`   ${result.url}`);
      lines.push(`   ${result.content}\n`);
    }
  }

  return lines.join('\n') || 'No results found.';
}

// --- web_search ---
register({
  name: 'web_search',
  description: 'Search the internet for up-to-date information using Tavily API.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query',
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of results to return',
        default: 5,
      },
    },
    required: ['query'],
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<string> {
    const query = String(args.query);
    const maxResults = Number(args.max_results) || context.config.tools.web_search.max_results;

    const apiKey = context.config.tools.web_search.api_key;
    if (!apiKey) {
      return 'Error: Tavily API key not configured. Run: vela config set tools.web_search.api_key <key>\nGet a free key at: https://tavily.com/';
    }

    const backend = context.config.tools.web_search.backend;
    if (backend !== 'tavily') {
      return `Error: Unknown search backend "${backend}". Currently only "tavily" is supported.`;
    }

    return await tavilySearch(query, maxResults, apiKey);
  },
});
