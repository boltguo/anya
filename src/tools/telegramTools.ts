/**
 * @module tools/telegramTools
 * @description Unified Telegram interaction tool for the Anya Agent.
 *
 * Consolidates all Telegram API interactions into a single `tg` tool with
 * a `type` parameter, reducing LLM function declaration overhead from
 * ~13 separate tool schemas to just 1 (~1300 prompt tokens saved per call).
 *
 * Available types: text, keyboard, quiz, force_reply, reply_keyboard,
 * remove_keyboard, edit, edit_keyboard, dice, react, pin, action.
 *
 * Interaction conventions are documented in SOUL.md. Specific skills
 * can override these defaults with their own requirements.
 */

import { register } from './registry.js';
import type { ToolContext } from '../agent/types.js';
import { TelegramSessionAdapter } from '../adapters/telegram.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract the TelegramSessionAdapter from the tool context.
 * @throws {Error} If the current session is not running via Telegram.
 */
function getTgAdapter(context: ToolContext): TelegramSessionAdapter {
  if (!(context.adapter instanceof TelegramSessionAdapter)) {
    throw new Error('This tool is only available when running via Telegram.');
  }
  return context.adapter;
}

/**
 * Parse a raw argument into a 2D string array (for button grids).
 * Accepts JSON strings or pre-parsed arrays.
 */
function parseArray(raw: unknown): string[][] {
  if (!raw) return [];
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return []; }
  }
  return raw as string[][];
}

/**
 * Parse a raw argument into a 1D string array (for quiz options).
 * Accepts JSON strings or pre-parsed arrays.
 */
function parseStringArray(raw: unknown): string[] {
  if (!raw) return [];
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return []; }
  }
  return raw as string[];
}

// ── Single unified Telegram tool ─────────────────────────────────────────────
//
// All Telegram interactions go through this one tool.
// The `type` field determines the message format:
//
//   text           → Plain text message
//   keyboard       → Message with inline buttons (callback-based)
//   quiz           → Native poll with auto-scoring
//   force_reply    → Forces user's keyboard open for free-text input
//   reply_keyboard → Persistent bottom keyboard menu
//   remove_keyboard→ Remove the bottom keyboard
//   edit           → Edit an existing message's text/buttons
//   edit_keyboard  → Edit only the buttons of an existing message
//   dice           → Send animated dice/emoji
//   react          → Add emoji reaction to a message
//   pin            → Pin a message to the top of the chat
//   action         → Show typing/recording indicator
//
// Interaction conventions are documented in SOUL.md.

register({
  name: 'tg',
  description: 'Send or manage Telegram messages. Use `type` to choose the format: text, keyboard (inline buttons), quiz (auto-scored poll), force_reply, reply_keyboard (bottom menu), edit, dice, react, pin, action. See SOUL.md for usage patterns.',
  parameters: {
    type: 'object',
    properties: {
      type:       { type: 'string', description: 'Message type: text | keyboard | quiz | force_reply | reply_keyboard | remove_keyboard | edit | edit_keyboard | dice | react | pin | action' },
      text:       { type: 'string', description: 'Message text (Markdown). Required for text/keyboard/force_reply/reply_keyboard/remove_keyboard/edit.' },
      buttons:    { type: 'string', description: 'JSON 2D array. For keyboard: [["label|callback_data",...]], for reply_keyboard: [["label",...]].' },
      options:    { type: 'string', description: 'For quiz: JSON array of option strings.' },
      correct:    { type: 'string', description: 'For quiz: 0-based index of correct answer.' },
      explanation:{ type: 'string', description: 'For quiz: explanation shown after answering.' },
      message_id: { type: 'string', description: 'For edit/edit_keyboard/react/pin: target message_id (number) or tag.' },
      reply_to:   { type: 'string', description: 'Reply to a message_id, tag, or "user" for the incoming message.' },
      tag:        { type: 'string', description: 'Tag this message for later reference (edit, pin, reply-to).' },
      emoji:      { type: 'string', description: 'For dice or react: emoji to use.' },
      action:     { type: 'string', description: 'For action type: typing, record_voice, upload_document, etc.' },
      one_time:   { type: 'string', description: 'For reply_keyboard: "true" to auto-hide after tap.' },
      silent:     { type: 'string', description: 'For pin: "true" to pin without notification.' },
      parse_mode: { type: 'string', description: 'Parse mode: Markdown (default), HTML, or none.' },
    },
    required: ['type'],
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<string> {
    const tg = getTgAdapter(context);
    const type = String(args.type);

    switch (type) {
      case 'text': {
        let replyTo: number | string | undefined = args.reply_to as string | undefined;
        if (replyTo === 'user') replyTo = tg.getUserMessageId();
        const msgId = await tg.sendMessage(String(args.text || ''), {
          replyTo, tag: args.tag as string,
          parseMode: (args.parse_mode as any) || 'Markdown',
        });
        return JSON.stringify({ ok: true, message_id: msgId });
      }

      case 'keyboard': {
        const buttons = parseArray(args.buttons);
        let replyTo: number | string | undefined = args.reply_to as string | undefined;
        if (replyTo === 'user') replyTo = tg.getUserMessageId();
        const msgId = await tg.sendKeyboard(String(args.text || ''), buttons, {
          replyTo, tag: args.tag as string,
        });
        return JSON.stringify({ ok: true, message_id: msgId });
      }

      case 'quiz': {
        const options = parseStringArray(args.options);
        const result = await tg.sendQuiz(
          String(args.text || ''),
          options,
          parseInt(String(args.correct || '0'), 10),
          args.explanation as string,
        );
        return JSON.stringify({ ok: true, ...result });
      }

      case 'force_reply': {
        let replyTo: number | string | undefined = args.reply_to as string | undefined;
        if (replyTo === 'user') replyTo = tg.getUserMessageId();
        const msgId = await tg.sendForceReply(String(args.text || ''), {
          replyTo, tag: args.tag as string,
        });
        return JSON.stringify({ ok: true, message_id: msgId });
      }

      case 'reply_keyboard': {
        const buttons = parseArray(args.buttons);
        const msgId = await tg.sendReplyKeyboard(String(args.text || ''), buttons, {
          oneTime: args.one_time === 'true',
          tag: args.tag as string,
        });
        return JSON.stringify({ ok: true, message_id: msgId });
      }

      case 'remove_keyboard': {
        const msgId = await tg.removeKeyboard(String(args.text || ''));
        return JSON.stringify({ ok: true, message_id: msgId });
      }

      case 'edit': {
        const msgRef = args.message_id as string;
        const buttons = args.buttons ? parseArray(args.buttons) : undefined;
        await tg.editMessage(
          isNaN(Number(msgRef)) ? msgRef : Number(msgRef),
          String(args.text || ''), buttons
        );
        return JSON.stringify({ ok: true });
      }

      case 'edit_keyboard': {
        const msgRef = args.message_id as string;
        const buttons = parseArray(args.buttons);
        await tg.editKeyboard(
          isNaN(Number(msgRef)) ? msgRef : Number(msgRef), buttons
        );
        return JSON.stringify({ ok: true });
      }

      case 'dice': {
        const result = await tg.sendDice(String(args.emoji || '🎲'));
        return JSON.stringify({ ok: true, ...result });
      }

      case 'react': {
        let ref: number | string = args.message_id as string;
        if (ref === 'user') ref = tg.getUserMessageId()!;
        await tg.react(ref, String(args.emoji || '👍'));
        return JSON.stringify({ ok: true });
      }

      case 'pin': {
        const ref = args.message_id as string;
        await tg.pin(isNaN(Number(ref)) ? ref : Number(ref), args.silent === 'true');
        return JSON.stringify({ ok: true });
      }

      case 'action': {
        await tg.sendChatAction(String(args.action || 'typing'));
        return JSON.stringify({ ok: true });
      }

      default:
        return JSON.stringify({ error: `Unknown type: ${type}. Use: text, keyboard, quiz, force_reply, reply_keyboard, remove_keyboard, edit, edit_keyboard, dice, react, pin, action.` });
    }
  },
});
