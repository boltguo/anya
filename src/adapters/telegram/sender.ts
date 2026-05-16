// adapters/telegram/sender.ts — HTML send/edit with plain-text fallback

import type { Bot } from 'grammy';
import { agentLogger } from '../../lib/logger.js';

export interface SendOptions {
  parse_mode?: string;
  reply_parameters?: { message_id: number };
  reply_markup?: unknown;
  link_preview_options?: { is_disabled: boolean };
}

/**
 * Send text with HTML parse_mode; on failure, retry without parse_mode (or with `fallbackText` if given).
 * Returns the sent message or null if both attempts failed.
 */
export async function sendTextWithFallback(
  bot: Bot,
  chatId: number,
  text: string,
  options: SendOptions = {},
  fallbackText?: string,
): Promise<{ message_id: number } | null> {
  try {
    return await bot.api.sendMessage(chatId, text, options as any);
  } catch (err) {
    agentLogger.warn({ msg: 'tg_html_parse_fallback', error: (err as Error)?.message, textLen: text.length });
    const { parse_mode: _pm, ...rest } = options;
    return bot.api.sendMessage(chatId, fallbackText ?? text, rest as any).catch((err2) => {
      agentLogger.error({ msg: 'tg_send_dropped', error: (err2 as Error)?.message });
      return null;
    });
  }
}

/** Edit text with HTML parse_mode; on failure, retry without parse_mode. Silent on final failure. */
export async function editTextWithFallback(
  bot: Bot,
  chatId: number,
  messageId: number,
  text: string,
  options: SendOptions = {},
): Promise<void> {
  try {
    await bot.api.editMessageText(chatId, messageId, text, options as any);
  } catch {
    const { parse_mode: _pm, ...rest } = options;
    await bot.api.editMessageText(chatId, messageId, text, rest as any).catch(() => {});
  }
}
