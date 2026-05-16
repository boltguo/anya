// tools/telegram.ts — single-entry Telegram tool (tg_msg)
// Consolidated into one polymorphic tool to save ~1300 prompt tokens per call.

import { register } from './registry.js';
import type { ToolContext } from '../agent/types.js';
import { TelegramSessionAdapter } from '../adapters/telegram.js';
import { markdownToTelegramHtml } from '../adapters/telegram/format.js';

function renderText(text: string | undefined, parseMode: string | undefined): string {
  if (!text) return '';
  const mode = parseMode || 'HTML';
  if (mode !== 'HTML') return text;
  // Detect common markdown markers so pure-HTML input is left untouched.
  const looksLikeMarkdown = /(^|\n)\s{0,3}#{1,6}\s|\*\*[^*]+\*\*|(^|\n)\s*[-*]\s+|`{3}/m.test(text);
  return looksLikeMarkdown ? markdownToTelegramHtml(text) : text;
}

function getTgAdapter(context: ToolContext): TelegramSessionAdapter {
  if (!(context.adapter instanceof TelegramSessionAdapter)) {
    throw new Error('This tool is only available when running via Telegram.');
  }
  return context.adapter;
}

function parseArray(raw: unknown): string[][] {
  if (!raw) return [];
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return []; }
  }
  return raw as string[][];
}

function parseStringArray(raw: unknown): string[] {
  if (!raw) return [];
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return []; }
  }
  return raw as string[];
}

// 'user' is a sentinel meaning "reply to the inbound message in this turn".
function resolveReplyTo(raw: unknown, tg: TelegramSessionAdapter): number | string | undefined {
  if (!raw) return undefined;
  const val = String(raw);
  return val === 'user' ? tg.getUserMessageId() : val;
}

// LLM occasionally emits `caption` instead of `text`; accept either, preferring `text`.
function getCaption(args: Record<string, unknown>): string | undefined {
  return (args.text as string) || (args.caption as string) || undefined;
}

register({
  name: 'tg_msg',
  description: 'Send or manage Telegram messages. Use `type` to choose the format: text, audio, voice, document (send files), keyboard (inline buttons), quiz (auto-scored poll), edit, delete, react, countdown (auto-edit timer with {seconds} placeholder), paginate (multi-page with client-side flipping). Default parse mode is HTML. Use <tg-spoiler>text</tg-spoiler> for hidden/reveal text (great for learning). Follow the active prompt instructions and skill-specific interaction rules.',
  parameters: {
    type: 'object',
    properties: {
      type:       { type: 'string', description: 'Message type: text | audio | voice | document | keyboard | quiz | edit | delete | react | countdown | paginate' },
      text:       { type: 'string', description: 'Message text/caption (HTML format). For countdown: use {seconds} as placeholder. For paginate: pages separated by ---PAGE--- delimiter.' },
      url:        { type: 'string', description: 'For audio/voice/document: URL or file path of the media to send.' },
      buttons:    { type: 'string', description: 'JSON 2D array for keyboard: [["label|callback_data",...]].' },
      options:    { type: 'string', description: 'For quiz: JSON array of option strings.' },
      correct:    { type: 'integer', description: 'For quiz: 0-based index of correct answer.' },
      explanation:{ type: 'string', description: 'For quiz: explanation shown after answering.' },
      message_id: { type: 'string', description: 'For edit/react: target message_id (number) or tag.' },
      reply_to:   { type: 'string', description: 'Reply to a message_id, tag, or "user" for the incoming message.' },
      tag:        { type: 'string', description: 'Tag this message for later reference (edit, reply-to).' },
      emoji:      { type: 'string', description: 'For react: emoji to use.' },
      parse_mode: { type: 'string', description: 'Parse mode: HTML (default), Markdown, MarkdownV2, or none.' },
      seconds:    { type: 'integer', description: 'For countdown: duration in seconds.' },
      expire_text:{ type: 'string', description: 'For countdown: text to show when timer reaches 0.' },
    },
    required: ['type'],
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<string> {
    const tg = getTgAdapter(context);
    const type = String(args.type);

    // LLMs sometimes emit literal "\n" in JSON args; normalize to a real newline.
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
        // Keyboard endpoint has no media slot; dispatch any bundled voice URL first to avoid silent drop.
        if (args.url) {
          await tg.sendVoice(String(args.url), undefined, {});
        }
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

      case 'countdown': {
        const seconds = Number(args.seconds || 60);
        const expireText = String(args.expire_text || '⏱️ 时间到！');
        const replyTo = resolveReplyTo(args.reply_to, tg);
        const msgId = await tg.sendCountdown(
          renderText(args.text as string, 'HTML'),
          seconds,
          renderText(expireText, 'HTML'),
          { replyTo, tag: args.tag as string },
        );
        return JSON.stringify({ ok: true, message_id: msgId, sent_content: true });
      }

      case 'paginate': {
        const delimiter = '---PAGE---';
        const rawText = String(args.text || '');
        const pages = rawText.split(delimiter).map((p) => renderText(p.trim(), 'HTML'));
        if (pages.length === 0) {
          return JSON.stringify({ error: 'paginate requires at least one page in text, separated by ---PAGE---' });
        }
        const trailingButtons = String(args.buttons || '[]');
        const replyTo = resolveReplyTo(args.reply_to, tg);
        const msgId = await tg.sendPaginate(pages, trailingButtons, {
          replyTo, tag: args.tag as string,
        });
        return JSON.stringify({ ok: true, message_id: msgId, page_count: pages.length, sent_content: true });
      }

      default:
        return JSON.stringify({ error: `Unknown type: ${type}. Use: text, audio, voice, document, keyboard, quiz, edit, delete, react, action, paginate.` });
    }
  },
});
