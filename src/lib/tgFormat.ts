/**
 * @module lib/tgFormat
 * @description Converts Markdown (LLM output) to Telegram MarkdownV2 format.
 *
 * Uses the `telegramify-markdown` library (remark-based) for robust AST-level
 * conversion instead of fragile regex transforms. Unsupported tags (e.g.
 * images, HTML) are escaped so they render as plain text.
 */

import telegramifyMarkdown from 'telegramify-markdown';

/**
 * Convert LLM Markdown output to Telegram MarkdownV2.
 *
 * @param md - Raw markdown string from LLM output.
 * @returns Telegram MarkdownV2 formatted string.
 */
export function markdownToTelegramV2(md: string): string {
  return telegramifyMarkdown(md, 'escape');
}

/**
 * Prepare a reply for Telegram: convert to MarkdownV2 with fallback to plain text.
 *
 * This is the primary send function used by the Telegram adapter.
 */
export function prepareReply(content: string): { text: string; parseMode: 'MarkdownV2' | undefined } {
  try {
    const v2 = markdownToTelegramV2(content);
    return { text: v2, parseMode: 'MarkdownV2' };
  } catch {
    return { text: content, parseMode: undefined };
  }
}
