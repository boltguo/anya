/**
 * @module adapters/telegram/errors
 * @description Translates raw error messages into user-friendly Telegram replies.
 */

import type { Context } from 'grammy';

/**
 * Formats an error into a user-friendly message suitable for Telegram output.
 *
 * @param error - The original Error object caught during execution.
 * @returns A string containing the formatted, user-facing error message.
 */
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

/**
 * Starts a recurring typing indicator in the provided Telegram context.
 *
 * Note: Telegram's "typing..." status naturally expires after approximately 5 seconds.
 * This function ensures it repeats every 4 seconds to maintain the indicator.
 *
 * @param ctx - The Telegram context object.
 * @returns An interval ID that can be used to clear the typing indicator.
 */
export function startTypingIndicator(ctx: Context): ReturnType<typeof setInterval> {
  const send = () => ctx.replyWithChatAction('typing').catch(() => {});
  send();
  return setInterval(send, 4000);
}
