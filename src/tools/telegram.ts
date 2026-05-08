/**
 * @module tools/telegram
 * @description Unified Telegram messaging interaction controller.
 *
 * Consolidates all Telegram Bot API outbound endpoints into a single polymorphic `tg_msg` tool.
 * This architectural choice significantly reduces LLM function declaration overhead, 
 * saving ~1300 prompt tokens per inference call relative to discrete tool schemas.
 *
 * Supported multimodal payloads:
 * - `text`, `audio`, `voice`, `document`, `keyboard`, `quiz`
 * - `force_reply`, `edit`, `delete`, `react`, `action`
 */

import { register } from './registry.js';
import type { ToolContext } from '../agent/types.js';
import { TelegramSessionAdapter } from '../adapters/telegram.js';
import { markdownToTelegramHtml } from '../lib/tgFormat.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * If parse_mode is HTML (the default) and the text contains markdown syntax,
 * convert markdown → Telegram-flavored HTML so headings/bold/lists render properly.
 * Pure HTML or empty input is left unchanged.
 */
function renderText(text: string | undefined, parseMode: string | undefined): string {
  if (!text) return '';
  const mode = parseMode || 'HTML';
  if (mode !== 'HTML') return text;
  // Cheap detection of common markdown markers (# headings, **bold**, list bullets, ``` code).
  const looksLikeMarkdown = /(^|\n)\s{0,3}#{1,6}\s|\*\*[^*]+\*\*|(^|\n)\s*[-*]\s+|`{3}/m.test(text);
  return looksLikeMarkdown ? markdownToTelegramHtml(text) : text;
}

/**
 * Extracts and validates the TelegramSessionAdapter from the generic tool context.
 *
 * @param {ToolContext} context - The active dependency container.
 * @returns {TelegramSessionAdapter} The typed adapter instance.
 * @throws {Error} If invoked outside a Telegram-backed session.
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

/**
 * Resolve the reply_to argument: maps 'user' to the incoming message ID.
 */
function resolveReplyTo(raw: unknown, tg: TelegramSessionAdapter): number | string | undefined {
  if (!raw) return undefined;
  const val = String(raw);
  return val === 'user' ? tg.getUserMessageId() : val;
}

/**
 * Unifies `text` and `caption` arguments.
 * The LLM sometimes uses `caption` instead of `text` for media messages.
 * Priority: text > caption > undefined.
 */
function getCaption(args: Record<string, unknown>): string | undefined {
  return (args.text as string) || (args.caption as string) || undefined;
}

// ── Single unified Telegram tool ─────────────────────────────────────────────
//
// All Telegram interactions go through this one tool.
// The `type` field determines the message format:
//
//   text           → Plain text message
//   audio          → Audio file with optional caption
//   voice          → Voice-bubble audio from a local OGG/Opus path
//   document       → Send a file (PDF, ZIP, etc.) with optional caption
//   keyboard       → Message with inline buttons (callback-based)
//   quiz           → Native poll with auto-scoring
//   force_reply    → Forces user's keyboard open for free-text input
//   edit           → Edit an existing message's text/buttons
//   delete         → Delete a message by id or tag
//   react          → Add emoji reaction to a message
//   action         → Show typing/recording indicator

register({
  name: 'tg_msg',
  description: 'Send or manage Telegram messages. Use `type` to choose the format: text, audio, voice, document (send files), keyboard (inline buttons), quiz (auto-scored poll), force_reply, edit, delete, react, action. Default parse mode is HTML. Use <tg-spoiler>text</tg-spoiler> for hidden/reveal text (great for learning). Follow the active prompt instructions and skill-specific interaction rules.',
  parameters: {
    type: 'object',
    properties: {
      type:       { type: 'string', description: 'Message type: text | audio | voice | document | keyboard | quiz | force_reply | edit | delete | react | action' },
      text:       { type: 'string', description: 'Message text/caption (HTML format). Use <b>bold</b>, <i>italic</i>, <code>code</code>, <pre>block</pre>, <tg-spoiler>hidden</tg-spoiler>.' },
      url:        { type: 'string', description: 'For audio/voice/document: URL or file path of the media to send.' },
      buttons:    { type: 'string', description: 'JSON 2D array for keyboard: [["label|callback_data",...]].' },
      options:    { type: 'string', description: 'For quiz: JSON array of option strings.' },
      correct:    { type: 'integer', description: 'For quiz: 0-based index of correct answer.' },
      explanation:{ type: 'string', description: 'For quiz: explanation shown after answering.' },
      message_id: { type: 'string', description: 'For edit/react: target message_id (number) or tag.' },
      reply_to:   { type: 'string', description: 'Reply to a message_id, tag, or "user" for the incoming message.' },
      tag:        { type: 'string', description: 'Tag this message for later reference (edit, reply-to).' },
      emoji:      { type: 'string', description: 'For react: emoji to use.' },
      action:     { type: 'string', description: 'For action type: typing, record_voice, upload_document, etc.' },
      parse_mode: { type: 'string', description: 'Parse mode: HTML (default), Markdown, MarkdownV2, or none.' },
    },
    required: ['type'],
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<string> {
    const tg = getTgAdapter(context);
    const type = String(args.type);

    // Normalize literal \n sequences the LLM sometimes emits in JSON args
    for (const field of ['text', 'caption'] as const) {
      if (typeof args[field] === 'string') {
        args[field] = (args[field] as string).replace(/\\n/g, '\n');
      }
    }

    switch (type) {
      case 'text': {
        const replyTo = resolveReplyTo(args.reply_to, tg);
        const parseMode = (args.parse_mode as string) || 'HTML';
        const msgId = await tg.sendMessage(renderText(args.text as string, parseMode), {
          replyTo, tag: args.tag as string,
          parseMode: parseMode as any,
        });
        return JSON.stringify({ ok: true, message_id: msgId, sent_content: true });
      }

      case 'audio': {
        const url = String(args.url || '');
        if (!url) return JSON.stringify({ ok: false, error: 'url is required for audio type' });
        const replyTo = resolveReplyTo(args.reply_to, tg);
        const parseMode = (args.parse_mode as string) || 'HTML';
        const msgId = await tg.sendAudio(url, renderText(getCaption(args), parseMode), {
          replyTo, tag: args.tag as string,
          parseMode: parseMode as any,
        });
        return JSON.stringify({ ok: true, message_id: msgId, sent_content: true });
      }

      case 'voice': {
        const url = String(args.url || '');
        if (!url) return JSON.stringify({ ok: false, error: 'url is required for voice type' });
        const replyTo = resolveReplyTo(args.reply_to, tg);
        const parseMode = (args.parse_mode as string) || 'HTML';
        const msgId = await tg.sendVoice(url, renderText(getCaption(args), parseMode), {
          replyTo, tag: args.tag as string,
          parseMode: parseMode as any,
        });
        return JSON.stringify({ ok: true, message_id: msgId, sent_content: true });
      }

      case 'keyboard': {
        const buttons = parseArray(args.buttons);
        const replyTo = resolveReplyTo(args.reply_to, tg);
        const parseMode = (args.parse_mode as string) || 'HTML';
        const msgId = await tg.sendKeyboard(renderText(args.text as string, parseMode), buttons, {
          replyTo, tag: args.tag as string,
        });
        return JSON.stringify({ ok: true, message_id: msgId, sent_content: true });
      }

      case 'quiz': {
        const options = parseStringArray(args.options);
        const result = await tg.sendQuiz(
          String(args.text || ''),
          options,
          Number(args.correct ?? 0),
          args.explanation as string,
        );
        return JSON.stringify({ ok: true, ...result, sent_content: true });
      }

      case 'force_reply': {
        const replyTo = resolveReplyTo(args.reply_to, tg);
        const parseMode = (args.parse_mode as string) || 'HTML';
        const msgId = await tg.sendForceReply(renderText(args.text as string, parseMode), {
          replyTo, tag: args.tag as string,
        });
        return JSON.stringify({ ok: true, message_id: msgId, sent_content: true });
      }

      case 'edit': {
        const msgRef = args.message_id as string;
        const buttons = args.buttons ? parseArray(args.buttons) : undefined;
        const parseMode = (args.parse_mode as string) || 'HTML';
        await tg.editMessage(
          isNaN(Number(msgRef)) ? msgRef : Number(msgRef),
          renderText(args.text as string, parseMode), buttons
        );
        return JSON.stringify({ ok: true, sent_content: false });
      }

      case 'document': {
        const replyTo = resolveReplyTo(args.reply_to, tg);
        const parseMode = (args.parse_mode as string) || 'HTML';
        const msgId = await tg.sendDocument(String(args.url || ''), {
          caption: renderText(getCaption(args), parseMode),
          replyTo, tag: args.tag as string,
          parseMode: parseMode as any,
        });
        return JSON.stringify({ ok: true, message_id: msgId, sent_content: true });
      }

      case 'delete': {
        const ref = args.message_id as string;
        const deleted = await tg.deleteMsg(isNaN(Number(ref)) ? ref : Number(ref));
        return JSON.stringify({ ok: deleted });
      }

      case 'react': {
        let ref: number | string = args.message_id as string;
        if (ref === 'user') ref = tg.getUserMessageId()!;
        await tg.react(ref, String(args.emoji || '👍'));
        return JSON.stringify({ ok: true, sent_content: false });
      }

      case 'action': {
        await tg.sendChatAction(String(args.action || 'typing'));
        return JSON.stringify({ ok: true, sent_content: false });
      }

      default:
        return JSON.stringify({ error: `Unknown type: ${type}. Use: text, audio, voice, document, keyboard, quiz, force_reply, edit, delete, react, action.` });
    }
  },
});
