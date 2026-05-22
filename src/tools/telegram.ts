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

// Convert ||hidden|| shorthand into <tg-spoiler>...</tg-spoiler>. Single-line,
// non-greedy, and inner content cannot contain | — avoids markdown-table conflicts.
function applySpoiler(text: string | undefined): string {
  if (!text) return '';
  return text.replace(/\|\|([^\n|]+?)\|\|/g, '<tg-spoiler>$1</tg-spoiler>');
}

register({
  name: 'tg_msg',
  description: 'Send or manage Telegram messages. Use `type` to choose the format: text, audio, voice, document (send files), keyboard (inline buttons), quiz (auto-scored poll), edit, delete, react, countdown (auto-edit timer with {seconds} placeholder), paginate (multi-page with client-side flipping), render (compound: react + media + text/buttons in one tool call, supports terminal flag to end the LLM turn). Default parse mode is HTML. Use <tg-spoiler>text</tg-spoiler> or ||hidden|| for hidden/reveal text. Follow the active prompt instructions and skill-specific interaction rules.',
  parameters: {
    type: 'object',
    properties: {
      type:       { type: 'string', description: 'Message type: text | audio | voice | document | keyboard | quiz | edit | delete | react | countdown | paginate | render' },
      text:       { type: 'string', description: 'Message text/caption (HTML format). For countdown: use {seconds} as placeholder. For paginate: pages separated by ---PAGE--- delimiter. For render: main text body, supports ||spoiler|| shorthand.' },
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
      react:      { type: 'object', description: 'For render: {"target":"user"|tag|message_id, "emoji":"👍"}. Reaction is sent before media/text.' },
      media:      { type: 'object', description: 'For render: {"type":"voice"|"audio"|"document", "url":"/path"}.' },
      terminal:   { type: 'boolean', description: 'For render (and any sent_content type): if true, end the LLM turn immediately after this tool call succeeds. Default false.' },
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

      case 'render': {
        const replyTo = resolveReplyTo(args.reply_to, tg);
        const parseMode = (args.parse_mode as string) || 'HTML';
        const terminal = args.terminal === true || args.terminal === 'true';
        const messageIds: number[] = [];

        // 1. reaction — fire-and-forget; never block main send
        const reactArg = args.react as { target?: unknown; emoji?: unknown } | undefined;
        if (reactArg && reactArg.target) {
          const rawTarget = reactArg.target;
          const target = rawTarget === 'user' ? tg.getUserMessageId()
                       : typeof rawTarget === 'number' ? rawTarget
                       : String(rawTarget);
          const emoji = String(reactArg.emoji || '👍');
          if (target) {
            try { await tg.react(target as number | string, emoji); }
            catch { /* reaction failure must not break the message flow */ }
          }
        }

        // 2. media (optional) — caption only if there are no buttons to attach later
        const mediaArg = args.media as { type?: string; url?: string } | undefined;
        const text = renderText(applySpoiler(args.text as string | undefined), parseMode);
        const buttons = args.buttons ? parseArray(args.buttons) : undefined;
        const hasButtons = Array.isArray(buttons) && buttons.length > 0;

        let mediaSent = false;
        if (mediaArg && mediaArg.url) {
          const url = String(mediaArg.url);
          const mediaCaption = (!hasButtons && text) ? text : undefined;
          const mediaType = String(mediaArg.type || 'voice');
          let id: number | null = null;
          if (mediaType === 'audio') {
            id = await tg.sendAudio(url, mediaCaption, { replyTo, tag: args.tag as string, parseMode: parseMode as any });
          } else if (mediaType === 'document') {
            id = await tg.sendDocument(url, { caption: mediaCaption, replyTo, tag: args.tag as string, parseMode });
          } else {
            id = await tg.sendVoice(url, mediaCaption, { replyTo, tag: args.tag as string, parseMode: parseMode as any });
          }
          if (id) messageIds.push(id);
          mediaSent = true;
        }

        // 3. text + buttons (or plain text) — only when not already absorbed as media caption
        const captionAlreadyOnMedia = mediaSent && !hasButtons && !!text;
        if (hasButtons) {
          // text may be empty here; sendKeyboard requires some text — use a thin-space fallback
          const kbText = text || '​';
          // Avoid double-replying to user when media already did the reply
          const replyToText = mediaSent ? undefined : replyTo;
          const tagForText = mediaSent ? undefined : (args.tag as string | undefined);
          const id = await tg.sendKeyboard(kbText, buttons!, { replyTo: replyToText, tag: tagForText });
          messageIds.push(id);
        } else if (text && !captionAlreadyOnMedia) {
          const id = await tg.sendMessage(text, { replyTo, tag: args.tag as string, parseMode: parseMode as any });
          messageIds.push(id);
        }

        return JSON.stringify({
          ok: true,
          message_ids: messageIds,
          sent_content: messageIds.length > 0,
          terminal,
        });
      }

      default:
        return JSON.stringify({ error: `Unknown type: ${type}. Use: text, audio, voice, document, keyboard, quiz, edit, delete, react, countdown, paginate, render.` });
    }
  },
});
