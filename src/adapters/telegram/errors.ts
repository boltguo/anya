// adapters/telegram/errors.ts — error formatting

export function formatTgError(error: Error): string {
  const msg = error.message || '';

  if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
    return '⚠️ API rate limit reached. Please try again later.';
  }

  if (msg.includes('401') || msg.includes('403') || msg.includes('API_KEY_INVALID')) {
    return '⚠️ API key is invalid or expired. Run `anya config edit` to update.';
  }

  if (msg.includes('500') || msg.includes('502') || msg.includes('503')) {
    return '⚠️ API service temporarily unavailable. Please try again later.';
  }

  const clean = msg.replace(/https?:\/\/[^\s"]+/g, '[link]').substring(0, 200);
  return `⚠️ ${clean}`;
}
