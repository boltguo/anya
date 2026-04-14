/**
 * @module tools/webSearch
 * @description Web search tool using Tavily API.
 *
 * Search results are cached to `~/.anya/data/search/` as JSON files,
 * enabling offline review and deduplication of repeated queries.
 */

import { register } from './registry.js';
import type { ToolContext } from '../agent/types.js';
import { SEARCH_CACHE_DIR } from '../lib/paths.js';
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

// ── Cache Helpers ────────────────────────────────────────────────────────────

/**
 * Generate a filesystem-safe cache key from a query string.
 * Uses SHA-256 hash to avoid path length and character issues.
 */
function cacheKey(query: string): string {
  const hash = createHash('sha256').update(query.toLowerCase().trim()).digest('hex').slice(0, 12);
  const slug = query.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40);
  return `${slug}_${hash}`;
}

/**
 * Read cached search result if it exists and is fresh (< 24 hours).
 * @returns Cached result string, or null if expired/missing.
 */
function readCache(query: string): string | null {
  const filePath = join(SEARCH_CACHE_DIR, `${cacheKey(query)}.json`);
  if (!existsSync(filePath)) return null;

  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
    const ageMs = Date.now() - new Date(raw.timestamp).getTime();
    const maxAgeMs = 24 * 60 * 60 * 1000; // 24 hours

    if (ageMs < maxAgeMs) {
      return raw.result;
    }
  } catch {
    // Corrupted cache file, ignore
  }
  return null;
}

/**
 * Write search result to cache.
 */
function writeCache(query: string, result: string, rawData: unknown): void {
  if (!existsSync(SEARCH_CACHE_DIR)) {
    mkdirSync(SEARCH_CACHE_DIR, { recursive: true });
  }
  const filePath = join(SEARCH_CACHE_DIR, `${cacheKey(query)}.json`);
  writeFileSync(filePath, JSON.stringify({
    query,
    timestamp: new Date().toISOString(),
    result,
    raw: rawData,
  }, null, 2));
}

// ── Tavily API ───────────────────────────────────────────────────────────────

/**
 * Search the web using the Tavily API.
 * @see https://docs.tavily.com/
 *
 * @param query - The search query string.
 * @param maxResults - Maximum number of results to return.
 * @param apiKey - Tavily API key.
 * @returns Formatted markdown search results and raw API response.
 */
async function tavilySearch(
  query: string,
  maxResults: number,
  apiKey: string,
): Promise<{ formatted: string; raw: unknown }> {
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

  const formatted = lines.join('\n') || 'No results found.';
  return { formatted, raw: data };
}

// ── Tool Registration ────────────────────────────────────────────────────────

register({
  name: 'web_search',
  description: 'Search the internet for up-to-date information using Tavily API. Results are cached for 24 hours.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query',
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of results to return (default: 5).',
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
      return 'Error: Tavily API key not configured. Run: anya config set tools.web_search.api_key <key>\nGet a free key at: https://tavily.com/';
    }

    const backend = context.config.tools.web_search.backend;
    if (backend !== 'tavily') {
      return `Error: Unknown search backend "${backend}". Currently only "tavily" is supported.`;
    }

    // Save result as record
    const { formatted, raw } = await tavilySearch(query, maxResults, apiKey);
    writeCache(query, formatted, raw);
    return formatted;
  },
});
