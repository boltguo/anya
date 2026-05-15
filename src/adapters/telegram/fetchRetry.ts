// adapters/telegram/fetchRetry.ts — bounded retry for Telegram CDN downloads

import { agentLogger } from '../../lib/logger.js';

export async function fetchWithRetry(url: string, maxAttempts = 3, timeoutMs = 15_000): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) return res;
      agentLogger.warn({ msg: 'fetch_retry', attempt, status: res.status, url: url.substring(0, 60) });
    } catch (err) {
      lastError = err as Error;
      agentLogger.warn({ msg: 'fetch_retry', attempt, error: (err as Error).message });
    }
    if (attempt < maxAttempts) await new Promise(r => setTimeout(r, 1000 * attempt));
  }
  throw lastError ?? new Error(`Download failed after ${maxAttempts} attempts`);
}
