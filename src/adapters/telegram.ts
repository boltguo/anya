// adapters/telegram.ts — Telegram adapter entry point

export { TelegramAdapter } from './telegram/TelegramAdapter.js';
export { TelegramSessionAdapter } from './telegram/SessionAdapter.js';
export { splitMarkdownForTelegram, stripMarkdown } from './telegram/markdown.js';
export type { SendMessageOptions } from './telegram/types.js';
