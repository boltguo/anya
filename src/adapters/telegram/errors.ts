/**
 * @module adapters/telegram/errors
 * @description Translates raw error messages into user-friendly Telegram replies.
 */

export function formatTgError(error: Error): string {
  const msg = error.message || '';

  if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
    return '⚠️ API 请求次数已用完，请稍后再试。';
  }

  if (msg.includes('401') || msg.includes('403') || msg.includes('API_KEY_INVALID')) {
    return '⚠️ API Key 无效或已过期，请运行 anya config edit 更新。';
  }

  if (msg.includes('500') || msg.includes('502') || msg.includes('503')) {
    return '⚠️ API 服务暂时不可用，请稍后重试。';
  }

  const clean = msg.replace(/https?:\/\/[^\s"]+/g, '[link]').substring(0, 200);
  return `⚠️ ${clean}`;
}

import type { Context } from 'grammy';

/**
 * Telegram "typing..." status expires after ~5s, so we repeat every 4s.
 */
export function startTypingIndicator(ctx: Context): ReturnType<typeof setInterval> {
  const send = () => ctx.replyWithChatAction('typing').catch(() => {});
  send();
  return setInterval(send, 4000);
}
