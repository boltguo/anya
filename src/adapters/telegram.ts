/**
 * @module adapters/telegram
 * @description Public entry point for the Telegram adapter.
 *
 * This module exports the necessary components for integrating the Agent with the Telegram platform.
 * The implementation is split across `src/adapters/telegram/`:
 *   - {@link TelegramAdapter}        — Top-level Bot manager handling lifecycle and routing.
 *   - {@link TelegramSessionAdapter} — Per-request Adapter for `Agent.run()`.
 *   - {@link splitMarkdownForTelegram} / {@link stripMarkdown} — Markdown formatting helpers.
 *
 * ## Architecture
 *
 * ```
 * ┌──────────────────────────────────────────────────────────────────┐
 * │  TelegramAdapter (Singleton)                                     │
 * │  - Owns the Grammy Bot instance and long-polling lifecycle       │
 * │  - Routes incoming messages & callback queries                   │
 * │  - Manages shared pendingApprovals / pendingChoices maps         │
 * │                                                                  │
 * │  ┌───────────────────────────────────────────────────────────┐   │
 * │  │ TelegramSessionAdapter (Per-request)                      │   │
 * │  │ - Created for each incoming message or callback           │   │
 * │  │ - Implements the Adapter interface for Agent.run()        │   │
 * │  │ - Owns outbound queue, message tags, and status window    │   │
 * │  └───────────────────────────────────────────────────────────┘   │
 * └──────────────────────────────────────────────────────────────────┘
 * ```
 */

export { TelegramAdapter } from './telegram/TelegramAdapter.js';
export { TelegramSessionAdapter } from './telegram/SessionAdapter.js';
export { splitMarkdownForTelegram, stripMarkdown } from './telegram/markdown.js';
export type { SendMessageOptions } from './telegram/types.js';
