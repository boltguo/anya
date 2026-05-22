// adapters/telegram/SessionAdapter.ts — per-turn Adapter for Agent.run

import { isAbsolute } from 'node:path';
import { Bot, InlineKeyboard, InputFile, Context } from 'grammy';
import PQueue from 'p-queue';
import type { Adapter } from '../../agent/types.js';
import { agentLogger } from '../../lib/logger.js';
import { markdownToTelegramHtml } from './format.js';
import { stripMarkdown, splitMarkdownForTelegram } from './markdown.js';
import type { SendMessageOptions, PendingApproval, PendingChoice } from './types.js';

export class TelegramSessionAdapter implements Adapter {
  readonly platform = 'telegram' as const;
  private ctx: Context;
  private bot: Bot;
  private pendingApprovals: Map<string, PendingApproval>;
  private pendingChoices: Map<string, PendingChoice>;
  private activePolls: Map<string, { chatId: number; options: string[]; correctIndex: number }>;
  private paginatedMessages: Map<number, { pages: string[]; buttons: string; chatId: number }>;

  private taggedMessages = new Map<string, number>();
  private lastSentMessageId?: number;

  // ALL TG API calls go through this single queue to guarantee strict ordering
  private outboundQueue = new PQueue({ concurrency: 1 });

  private statusMessageId?: number;

  // dedup: set when any tg_msg tool sends content; reply() skips final send if true
  private hasSentContent = false;

  // smart reply: first content message auto-replies to user; later ones don't (avoids reply-chain spam)
  private hasRepliedToUser = false;

  constructor(
    ctx: Context,
    bot: Bot,
    _config: unknown,
    pendingApprovals: Map<string, PendingApproval>,
    pendingChoices: Map<string, PendingChoice>,
    activePolls?: Map<string, { chatId: number; options: string[]; correctIndex: number }>,
    paginatedMessages?: Map<number, { pages: string[]; buttons: string; chatId: number }>,
  ) {
    this.ctx = ctx;
    this.bot = bot;
    this.pendingApprovals = pendingApprovals;
    this.pendingChoices = pendingChoices;
    this.activePolls = activePolls ?? new Map();
    this.paginatedMessages = paginatedMessages ?? new Map();
  }

  // override for contexts without ctx.chat (e.g. poll_answer)
  private _overrideChatId?: number;

  private get chatId(): number {
    return this._overrideChatId ?? this.ctx.chat!.id;
  }

  setChatIdOverride(id: number): void {
    this._overrideChatId = id;
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return this.outboundQueue.add(fn, { priority: 0 }) as Promise<T>;
  }

  private resolveMessageId(ref?: number | string): number | undefined {
    if (!ref) return undefined;
    if (typeof ref === 'number') return ref;
    return this.taggedMessages.get(ref);
  }

  // First content message of a turn auto-replies to user; subsequent ones don't (avoid reply-chain spam)
  private autoReplyTo(explicitReplyTo?: number | string): number | undefined {
    const resolved = this.resolveMessageId(explicitReplyTo);
    if (resolved) return resolved;

    if (!this.hasRepliedToUser) {
      this.hasRepliedToUser = true;
      return this.getUserMessageId();
    }
    return undefined;
  }

  private trackMessage(messageId: number, tag?: string): void {
    this.lastSentMessageId = messageId;
    if (tag) {
      this.taggedMessages.set(tag, messageId);
    }
  }

  async reply(content: string): Promise<void> {
    await this.outboundQueue.onIdle();

    if (!this.hasSentContent && content) {
      let parsedContent = content;
      let replyMarkup: InlineKeyboard | undefined;

      const extractedButtons = [...parsedContent.matchAll(/\[([^\]]+)\|([^\]]+)\]/g)];
      if (extractedButtons.length > 0) {
        replyMarkup = new InlineKeyboard();
        for (const match of extractedButtons) {
          replyMarkup.text(match[1].trim(), match[2].trim()).row();
        }
        parsedContent = parsedContent
          .replace(/\[([^\]]+)\|([^\]]+)\]/g, '')
          .replace(/^[\s*-]+$/gm, '')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
      }

      if (!parsedContent && replyMarkup) {
        parsedContent = '👇';
      }

      const replyTo = this.autoReplyTo();
      const replyParams = replyTo ? { message_id: replyTo } : undefined;
      const maxLen = 4000;

      const segments = splitMarkdownForTelegram(parsedContent, maxLen);

      for (let idx = 0; idx < segments.length; idx++) {
        const segment = segments[idx];
        const formatted = markdownToTelegramHtml(segment);
        const rp = idx === 0 ? replyParams : undefined;
        const markup = idx === segments.length - 1 ? replyMarkup : undefined;

        const msg = await this.bot.api.sendMessage(this.chatId, formatted, {
          parse_mode: 'HTML',
          reply_parameters: rp,
          reply_markup: markup,
        }).catch(async (err) => {
          agentLogger.warn({ msg: 'tg_html_parse_fallback', error: err?.message, formattedLen: formatted.length, segmentIdx: idx });
          return this.bot.api.sendMessage(this.chatId, stripMarkdown(segment), {
            reply_parameters: rp,
            reply_markup: markup,
          }).catch((err2) => {
            agentLogger.error({ msg: 'tg_reply_dropped', error: err2?.message, segmentIdx: idx });
            return null;
          });
        });
        if (msg) this.trackMessage(msg.message_id);
      }
    }
  }

  private static TOOL_LABEL: Record<string, string> = {
    read_file: '📄 Reading file',
    write_file: '✏️ Writing file',
    list_dir: '📁 Browsing directory',
    web_search: '🌐 Searching web',
    memory: '🧠 Updating memory',
    skill_view: '🎓 Loading skill',
    clarify: '💬 Asking question',
    tg_msg: '',  // suppress — the actual message arrives immediately after
    tts: '🔊 Generating audio',
    pron_assess: '🗣️ Assessing pronunciation',
    db: '🗄️ Querying database',
    persist: '💾 Saving data',
  };

  private statusText = '🧠 Thinking...';

  // Allow the adapter (or any caller) to hand over a pre-existing status message
  // so we don't spam multiple "thinking..." messages per turn.
  attachStatusMessage(messageId: number): void {
    this.statusMessageId = messageId;
  }

  async sendThinking(): Promise<void> {
    this.statusText = '🧠 Thinking...';
    if (this.statusMessageId) {
      // already attached by caller — just rewrite contents
      await this.bot.api
        .editMessageText(this.chatId, this.statusMessageId, this.statusText)
        .catch(() => {});
      return;
    }
    const msg = await this.ctx.reply(this.statusText, { parse_mode: undefined }).catch(() => null);
    if (msg) this.statusMessageId = msg.message_id;
  }

  showToolCall(toolName: string, _args: Record<string, unknown>): void {
    const label = TelegramSessionAdapter.TOOL_LABEL[toolName];
    if (label === '') return; // suppress status for tools that deliver content directly
    this.statusText = `${label || `⚙️ ${toolName}`}...`;
    this.enqueue(() => this.flushStatus());
  }

  showToolResult(_toolName: string, _result: string, _isError: boolean): void {
    this.statusText = '🧠 Thinking...';
    this.enqueue(() => this.flushStatus());
  }

  // Always edits the same status message — never creates new ones
  private async flushStatus(): Promise<void> {
    try {
      const text = this.statusText;

      if (!this.statusMessageId) {
        const msg = await this.ctx.reply(text, { parse_mode: undefined }).catch(() => null);
        if (msg) this.statusMessageId = msg.message_id;
      } else {
        await this.bot.api.editMessageText(this.chatId, this.statusMessageId, text).catch(() => {});
      }
    } catch {
      // callback-query contexts may lack chat info; swallow rather than crash the gateway
    }
  }

  async cleanupStatus(): Promise<void> {
    if (this.statusMessageId) {
      await this.bot.api.deleteMessage(this.chatId, this.statusMessageId).catch(() => {});
      this.statusMessageId = undefined;
    }
  }

  async sendPaginate(
    pages: string[],
    trailingButtons: string,
    opts?: SendMessageOptions,
  ): Promise<number> {
    return this.enqueue(async () => {
      const replyTo = this.autoReplyTo(opts?.replyTo);
      const pageCount = pages.length;

      const navRow: Array<{ text: string; callback_data: string }> = [];

      let trailingRows: Array<Array<{ text: string; callback_data: string }>> = [];
      try {
        const parsed = JSON.parse(trailingButtons) as string[][];
        trailingRows = parsed.map((row) =>
          row.map((cell) => {
            const [label, cb] = cell.split('|');
            return { text: label, callback_data: cb || label };
          }),
        );
      } catch { /* ignore bad JSON */ }

      const msg = await this.bot.api.sendMessage(this.chatId, pages[0], {
        parse_mode: 'HTML',
        reply_parameters: replyTo ? { message_id: replyTo } : undefined,
        reply_markup: {
          inline_keyboard: [
            ...trailingRows,
          ],
        },
      });

      this.trackMessage(msg.message_id, opts?.tag);
      this.hasSentContent = true;

      this.paginatedMessages.set(msg.message_id, {
        pages,
        buttons: trailingButtons,
        chatId: this.chatId,
      });

      // Edit to add nav buttons now that we know msg.message_id (callback_data needs it)
      if (pageCount > 1) {
        navRow.push({ text: `➡️ 2/${pageCount}`, callback_data: `page:${msg.message_id}:1` });
        await this.bot.api.editMessageReplyMarkup(this.chatId, msg.message_id, {
          reply_markup: {
            inline_keyboard: [
              navRow,
              ...trailingRows,
            ],
          },
        }).catch(() => {});
      }

      return msg.message_id;
    });
  }

  async sendCountdown(
    initialText: string,
    seconds: number,
    expireText: string,
    opts?: SendMessageOptions,
  ): Promise<number> {
    return this.enqueue(async () => {
      const replyTo = this.autoReplyTo(opts?.replyTo);
      const formatText = (s: number) => initialText.replace(/\{seconds\}/g, String(s));

      const msg = await this.bot.api.sendMessage(this.chatId, formatText(seconds), {
        parse_mode: 'HTML',
        reply_parameters: replyTo ? { message_id: replyTo } : undefined,
      });

      this.trackMessage(msg.message_id, opts?.tag);
      this.hasSentContent = true;

      // Sparse edits to avoid Telegram flood limits: every 5s normally, every 1s in last 10s
      let remaining = seconds;
      const interval = setInterval(async () => {
        remaining--;
        if (remaining <= 0) {
          clearInterval(interval);
          await this.bot.api.editMessageText(this.chatId, msg.message_id, expireText, {
            parse_mode: 'HTML',
          }).catch(() => {});
        } else if (remaining <= 10 || remaining % 5 === 0) {
          await this.bot.api.editMessageText(this.chatId, msg.message_id, formatText(remaining), {
            parse_mode: 'HTML',
          }).catch(() => {});
        }
      }, 1000);

      return msg.message_id;
    });
  }

  async requestApproval(description: string): Promise<'allow' | 'deny' | 'always'> {
    const approvalId = `approval_${Date.now()}`;

    const keyboard = new InlineKeyboard()
      .text('✅ Allow', `${approvalId}:allow`)
      .text('❌ Deny', `${approvalId}:deny`)
      .text('🔓 Always', `${approvalId}:always`);

    await this.enqueue(async () => {
      await this.ctx.reply(
        `🔐 Approval Required\n\n${description}`,
        { reply_markup: keyboard },
      );
    });

    return new Promise<'allow' | 'deny' | 'always'>((resolve) => {
      this.pendingApprovals.set(approvalId, { resolve });
      setTimeout(() => {
        if (this.pendingApprovals.has(approvalId)) {
          this.pendingApprovals.delete(approvalId);
          resolve('deny');
        }
      }, 5 * 60 * 1000);
    });
  }

  async requestChoice(description: string, choices: string[]): Promise<string> {
    const choiceKey = `choice_${Date.now()}`;
    const keyboard = new InlineKeyboard();

    choices.forEach((choice, index) => {
      keyboard.text(choice, `${choiceKey}:${index}`);
      keyboard.row();
    });

    const sent = await this.ctx.reply(description, { reply_markup: keyboard });

    return new Promise<string>((resolve) => {
      this.pendingChoices.set(choiceKey, { resolve });
      setTimeout(() => {
        if (this.pendingChoices.has(choiceKey)) {
          this.pendingChoices.delete(choiceKey);
          this.bot.api.editMessageReplyMarkup(this.chatId, sent.message_id, { reply_markup: undefined }).catch(() => {});
          this.bot.api.editMessageText(this.chatId, sent.message_id, `${description}\n\n⏱ Timed out`).catch(() => {});
          resolve('');
        }
      }, 10 * 60 * 1000);
    });
  }

  async sendMessage(text: string, opts?: SendMessageOptions): Promise<number> {
    return this.enqueue(async () => {
      const replyTo = this.autoReplyTo(opts?.replyTo);
      const parseMode = opts?.parseMode === 'none' ? undefined : (opts?.parseMode || 'HTML');

      let msg;
      try {
        msg = await this.bot.api.sendMessage(this.chatId, text, {
          parse_mode: parseMode as any,
          reply_parameters: replyTo ? { message_id: replyTo } : undefined,
        });
      } catch {
        msg = await this.bot.api.sendMessage(this.chatId, text, {
          reply_parameters: replyTo ? { message_id: replyTo } : undefined,
        });
      }

      this.trackMessage(msg.message_id, opts?.tag);
      this.hasSentContent = true;
      return msg.message_id;
    });
  }


  async sendAudio(audio: string, caption?: string, opts?: SendMessageOptions): Promise<number> {
    return this.enqueue(async () => {
      const replyTo = this.autoReplyTo(opts?.replyTo);
      const parseMode = opts?.parseMode === 'none' ? undefined : (opts?.parseMode || 'HTML');
      const source = isAbsolute(audio) || audio.startsWith('.') ? new InputFile(audio) : audio;

      const msg = await this.bot.api.sendAudio(this.chatId, source, {
        caption: caption || undefined,
        parse_mode: parseMode as any,
        reply_parameters: replyTo ? { message_id: replyTo } : undefined,
      });

      this.trackMessage(msg.message_id, opts?.tag);
      this.hasSentContent = true;
      return msg.message_id;
    });
  }

  // Input file MUST be OGG/Opus to render as native Telegram voice bubble; other formats render as a file
  async sendVoice(voicePath: string, caption?: string, opts?: SendMessageOptions): Promise<number> {
    return this.enqueue(async () => {
      const replyTo = this.autoReplyTo(opts?.replyTo);
      const parseMode = opts?.parseMode === 'none' ? undefined : (opts?.parseMode || 'HTML');
      const source = new InputFile(voicePath);

      const msg = await this.bot.api.sendVoice(this.chatId, source, {
        caption: caption || undefined,
        parse_mode: parseMode as any,
        reply_parameters: replyTo ? { message_id: replyTo } : undefined,
      });

      this.trackMessage(msg.message_id, opts?.tag);
      if (caption) {
        this.hasSentContent = true;
      }
      agentLogger.info({ msg: 'tg_voice_sent', path: voicePath });
      return msg.message_id;
    });
  }

  async sendKeyboard(text: string, buttons: string[][], opts?: SendMessageOptions): Promise<number> {
    return this.enqueue(async () => {
      const replyTo = this.autoReplyTo(opts?.replyTo);
      const parseMode = opts?.parseMode === 'none' ? undefined : (opts?.parseMode || 'HTML');

      const keyboard = new InlineKeyboard();
      for (const row of buttons) {
        for (const btn of row) {
          const parts = btn.split('|', 2);
          const label = (parts[0] || '').trim();
          const data = (parts.length > 1 ? parts[1] : parts[0]).trim();
          keyboard.text(label, data);
        }
        keyboard.row();
      }

      let msg;
      try {
        msg = await this.bot.api.sendMessage(this.chatId, text, {
          parse_mode: parseMode as any,
          reply_markup: keyboard,
          reply_parameters: replyTo ? { message_id: replyTo } : undefined,
        });
      } catch {
        msg = await this.bot.api.sendMessage(this.chatId, text, {
          reply_markup: keyboard,
          reply_parameters: replyTo ? { message_id: replyTo } : undefined,
        });
      }

      this.trackMessage(msg.message_id, opts?.tag);
      this.hasSentContent = true;
      return msg.message_id;
    });
  }

  async sendQuiz(question: string, options: string[], correctIndex: number, explanation?: string, openPeriod?: number): Promise<{ messageId: number; pollId: string }> {
    return this.enqueue(async () => {
      const msg = await this.bot.api.sendPoll(this.chatId, question, options, {
        type: 'quiz',
        correct_option_id: correctIndex,
        is_anonymous: false,
        explanation: explanation || undefined,
        open_period: openPeriod || undefined,
      } as Record<string, unknown>);

      this.trackMessage(msg.message_id);
      this.hasSentContent = true;

      this.activePolls.set(msg.poll!.id, {
        chatId: this.chatId,
        options,
        correctIndex,
      });

      return { messageId: msg.message_id, pollId: msg.poll!.id };
    });
  }


  async editMessage(messageId: number | string, text: string, buttons?: string[][]): Promise<void> {
    return this.enqueue(async () => {
      const msgId = typeof messageId === 'string' ? this.taggedMessages.get(messageId) : messageId;
      if (!msgId) throw new Error(`Message not found: ${messageId}`);

      let replyMarkup = undefined;
      if (buttons) {
        const keyboard = new InlineKeyboard();
        for (const row of buttons) {
          for (const btn of row) {
            const parts = btn.split('|', 2);
            const label = (parts[0] || '').trim();
            const data = (parts.length > 1 ? parts[1] : parts[0]).trim();
            keyboard.text(label, data);
          }
          keyboard.row();
        }
        replyMarkup = keyboard;
      }

      await this.bot.api.editMessageText(this.chatId, msgId, text, {
        parse_mode: 'HTML',
        reply_markup: replyMarkup,
      }).catch(async () => {
        await this.bot.api.editMessageText(this.chatId, msgId, text, {
          reply_markup: replyMarkup,
        }).catch(() => {});
      });
    });
  }


  async sendDocument(
    fileUrl: string,
    opts: { caption?: string; tag?: string; replyTo?: number | string; parseMode?: string } = {},
  ): Promise<number | null> {
    return this.enqueue(async () => {
      const replyTo = this.autoReplyTo(opts.replyTo);
      const rp = replyTo ? { message_id: replyTo } : undefined;
      const source = isAbsolute(fileUrl) ? new InputFile(fileUrl) : fileUrl;
      const msg = await this.bot.api.sendDocument(this.chatId, source, {
        caption: opts.caption,
        parse_mode: (opts.parseMode as any) || undefined,
        reply_parameters: rp,
      }).catch((err) => {
        agentLogger.error({ msg: 'tg_send_document_error', error: err?.message });
        return null;
      });
      if (msg) {
        this.trackMessage(msg.message_id);
        if (opts.tag) this.taggedMessages.set(opts.tag, msg.message_id);
        return msg.message_id;
      }
      return null;
    });
  }

  async deleteMsg(messageId: number | string): Promise<boolean> {
    return this.enqueue(async () => {
      const msgId = typeof messageId === 'string'
        ? this.taggedMessages.get(messageId) ?? Number(messageId)
        : messageId;
      if (!msgId || isNaN(msgId)) return false;
      return this.bot.api.deleteMessage(this.chatId, msgId)
        .then(() => true)
        .catch(() => false);
    });
  }

  async react(messageId: number | string, emoji: string): Promise<void> {
    return this.enqueue(async () => {
      const msgId = typeof messageId === 'string' ? this.taggedMessages.get(messageId) : messageId;
      if (!msgId) throw new Error(`Message not found: ${messageId}`);

      await this.bot.api.setMessageReaction(this.chatId, msgId, [
        { type: 'emoji', emoji: emoji as any },
      ]).catch(() => {});
    });
  }

  getLastMessageId(): number | undefined {
    return this.lastSentMessageId;
  }

  getTaggedMessageId(tag: string): number | undefined {
    return this.taggedMessages.get(tag);
  }

  getUserMessageId(): number | undefined {
    return this.ctx.message?.message_id;
  }
}
