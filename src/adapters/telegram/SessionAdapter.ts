/**
 * @module adapters/telegram/SessionAdapter
 * @description Per-request Telegram adapter implementing the {@link Adapter}
 * interface for {@link Agent.run}.
 *
 * One instance is created for each incoming message or callback. It owns the
 * outbound queue, message tags, and the rolling status window for that turn,
 * and is destroyed afterwards — state does not persist across turns.
 *
 * Design highlights:
 *  - All TG API calls go through {@link enqueue} for strict ordering.
 *  - First content message in a turn auto-replies to the user (smart reply).
 *  - Tool execution feedback is shown in a single edited "status" message.
 *  - {@link hasSentContent} dedups final reply when a tool already sent text.
 */

import { isAbsolute } from 'node:path';
import { Bot, InlineKeyboard, InputFile, Context } from 'grammy';
import PQueue from 'p-queue';
import type { Adapter } from '../../agent/types.js';
import { agentLogger } from '../../lib/logger.js';
import { markdownToTelegramHtml } from '../../lib/tgFormat.js';
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

  // Maps user-defined tags to Telegram message_id for later reference.
  private taggedMessages = new Map<string, number>();
  private lastSentMessageId?: number;

  // ALL TG API calls go through this single queue.
  private outboundQueue = new PQueue({ concurrency: 1 });

  // A single message that gets created then edited in-place during tool exec.
  private statusMessageId?: number;

  // Set when any tg_msg tool sends content. reply() checks this to skip duplicates.
  private hasSentContent = false;

  // Smart reply: first content message auto-replies to the user's message.
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

  /** Allows overriding chatId for contexts without ctx.chat (e.g., poll_answer). */
  private _overrideChatId?: number;

  private get chatId(): number {
    return this._overrideChatId ?? this.ctx.chat!.id;
  }

  /** Override chatId for contexts without chat (e.g., poll_answer). */
  setChatIdOverride(id: number): void {
    this._overrideChatId = id;
  }

  // ── Queue infrastructure ──────────────────────────────────────────────────

  /** Enqueue a TG API call to guarantee strict ordering of outbound messages. */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return this.outboundQueue.add(fn, { priority: 0 }) as Promise<T>;
  }

  /** Resolve a message reference (numeric ID or string tag) to a Telegram message_id. */
  private resolveMessageId(ref?: number | string): number | undefined {
    if (!ref) return undefined;
    if (typeof ref === 'number') return ref;
    return this.taggedMessages.get(ref);
  }

  /**
   * 智能回复：解析回复目标。
   * 本轮对话中的第一条内容消息会自动回复用户的原始消息。
   * 同一轮中的后续消息不会自动回复（避免回复链刷屏）。
   */
  private autoReplyTo(explicitReplyTo?: number | string): number | undefined {
    const resolved = this.resolveMessageId(explicitReplyTo);
    if (resolved) return resolved;

    if (!this.hasRepliedToUser) {
      this.hasRepliedToUser = true;
      return this.getUserMessageId();
    }
    return undefined;
  }

  /** Track a sent message's ID and optional tag for later reference (edit, pin, etc). */
  private trackMessage(messageId: number, tag?: string): void {
    this.lastSentMessageId = messageId;
    if (tag) {
      this.taggedMessages.set(tag, messageId);
    }
  }

  // ── Core Adapter Interface ────────────────────────────────────────────────

  /**
   * Send the agent's final text reply to the user.
   *
   * Converts markdown to Telegram HTML via marked + whitelist post-process.
   * Falls back to plain text (stripped markdown) if HTML parsing fails.
   * Long messages are automatically split at safe boundaries.
   * Skips sending if a `tg_msg` tool already sent content (dedup).
   */
  async reply(content: string): Promise<void> {
    await this.outboundQueue.onIdle();

    if (!this.hasSentContent && content) {
      let parsedContent = content;
      let replyMarkup: InlineKeyboard | undefined;

      // Extract inline buttons formatted as [label|data] anywhere in the text
      const extractedButtons = [...parsedContent.matchAll(/\[([^\]]+)\|([^\]]+)\]/g)];
      if (extractedButtons.length > 0) {
        replyMarkup = new InlineKeyboard();
        for (const match of extractedButtons) {
          replyMarkup.text(match[1].trim(), match[2].trim()).row();
        }
        // Remove the button text and clean up dangling list items/newlines
        parsedContent = parsedContent
          .replace(/\[([^\]]+)\|([^\]]+)\]/g, '')
          .replace(/^[\s*-]+$/gm, '')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
      }

      // If text becomes completely empty after removing buttons, add a fallback text
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
        // Attach keyboard only to the last segment
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

  // ── Status window (single-line, edited in-place) ──────────────────────────

  /** User-friendly tool display labels */
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
    cron: '⏰ Updating schedule',
  };

  /** Current status text */
  private statusText = '🧠 Thinking...';

  /**
   * Send the initial "thinking" status immediately.
   * Called right after construction, before agent.run().
   */
  async sendThinking(): Promise<void> {
    this.statusText = '🧠 Thinking...';
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
    // Reset to thinking — next tool call or end-of-turn will update
    this.statusText = '🧠 Thinking...';
    this.enqueue(() => this.flushStatus());
  }

  /**
   * Flush the current status line to Telegram.
   * Always edits the same message — never creates new ones.
   */
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
      // Callback-query contexts may lack chat info; swallow rather than crash the gateway
    }
  }

  /**
   * Delete the status message. Called at end of turn (after reply).
   */
  async cleanupStatus(): Promise<void> {
    if (this.statusMessageId) {
      await this.bot.api.deleteMessage(this.chatId, this.statusMessageId).catch(() => {});
      this.statusMessageId = undefined;
    }
  }

  /**
   * Send a countdown timer message that auto-edits at decreasing intervals.
   * Uses sparse edits (every 5s) to avoid Telegram rate limits, with
   * per-second edits only in the final 10 seconds for dramatic effect.
   *
   * @param initialText - Text template with `{seconds}` placeholder for the countdown.
   * @param seconds - Duration in seconds.
   * @param expireText - Text to show when the countdown finishes.
   * @param opts - Standard send options.
   * @returns The message_id of the countdown message (returned immediately).
   */

  /**
   * Send a paginated message. All pages are stored in memory; the user flips
   * through them with ⬅️/➡️ buttons that edit the message in-place (no LLM call).
   *
   * @param pages - Array of HTML page strings.
   * @param trailingButtons - JSON 2D array string for constant buttons below the nav row.
   * @param opts - Standard send options.
   * @returns The message_id of the paginated message.
   */
  async sendPaginate(
    pages: string[],
    trailingButtons: string,
    opts?: SendMessageOptions,
  ): Promise<number> {
    return this.enqueue(async () => {
      const replyTo = this.autoReplyTo(opts?.replyTo);
      const pageCount = pages.length;

      // Build initial keyboard: nav buttons (page 1, so only ➡️) + trailing
      const navRow: Array<{ text: string; callback_data: string }> = [];
      // For page 0 (first page), only show next if there are more pages
      // We'll fill the callback_data with a placeholder; it gets the real msgId after send

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

      // Send the first page
      const msg = await this.bot.api.sendMessage(this.chatId, pages[0], {
        parse_mode: 'HTML',
        reply_parameters: replyTo ? { message_id: replyTo } : undefined,
        reply_markup: {
          inline_keyboard: [
            // nav row placeholder — will be set after we know msg.message_id
            ...trailingRows,
          ],
        },
      });

      this.trackMessage(msg.message_id, opts?.tag);
      this.hasSentContent = true;

      // Store pages for later flipping
      this.paginatedMessages.set(msg.message_id, {
        pages,
        buttons: trailingButtons,
        chatId: this.chatId,
      });

      // Now edit to add the real nav buttons (we needed msg.message_id first)
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

      // Fire-and-forget: the countdown runs in the background.
      // Sparse edits to avoid Telegram flood limits:
      //   > 10s remaining → edit every 5 seconds
      //   ≤ 10s remaining → edit every 1 second
      let remaining = seconds;
      const interval = setInterval(async () => {
        remaining--;
        if (remaining <= 0) {
          clearInterval(interval);
          await this.bot.api.editMessageText(this.chatId, msg.message_id, expireText, {
            parse_mode: 'HTML',
          }).catch(() => {});
        } else if (remaining <= 10 || remaining % 5 === 0) {
          // Edit at 5-second intervals, or every second in the last 10s
          await this.bot.api.editMessageText(this.chatId, msg.message_id, formatText(remaining), {
            parse_mode: 'HTML',
          }).catch(() => {});
        }
      }, 1000);

      return msg.message_id;
    });
  }

  /**
   * Present an approval prompt with inline keyboard buttons.
   * User taps a button → callback_query fires → resolved by TelegramAdapter.
   * Times out after 5 minutes, defaulting to 'deny'.
   */
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

  /**
   * Present a choice prompt with inline keyboard buttons.
   * Times out after 10 minutes, returning empty string.
   */
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

  // ── Native Telegram Capabilities (all enqueued for ordering & dedup) ──────

  /** Send a text message. Sets hasSentContent to skip duplicate final reply. */
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


  /** Send an audio file with optional caption. Accepts URL or local file path. */
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

  /**
   * Dispatches an asynchronous native Telegram Voice Note (audio bubble).
   * Note: The input audio file MUST be encoded in the OGG format utilizing the Opus codec
   * to trigger the native Telegram voice bubble UI. Standard audio files will render as playable files instead.
   *
   * @param voicePath - The absolute filesystem path to the compiled `.ogg` Opus audio file.
   * @param caption - Optional text content to accompany the voice note.
   * @param opts - Standard configuration options including parsing overrides and threading parameters.
   * @returns A Promise resolving to the unique integer ID of the dispatched voice message.
   */
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

  /** Send a message with inline keyboard buttons (callback-based). */
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

  /** Send a native Telegram quiz poll with auto-scoring. */
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

      // Register poll for answer tracking
      this.activePolls.set(msg.poll!.id, {
        chatId: this.chatId,
        options,
        correctIndex,
      });

      return { messageId: msg.message_id, pollId: msg.poll!.id };
    });
  }


  /** Edit an existing message's text and optionally its inline buttons. */
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


  /** Show a chat action indicator (typing, record_voice, etc). */
  async sendChatAction(action: string = 'typing'): Promise<void> {
    return this.enqueue(async () => {
      await this.bot.api.sendChatAction(this.chatId, action as any).catch(() => {});
    });
  }

  /** Send a document (file) with optional caption. */
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

  /** Delete a message by ID or tag. */
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

  /** Add an emoji reaction to a message. */
  async react(messageId: number | string, emoji: string): Promise<void> {
    return this.enqueue(async () => {
      const msgId = typeof messageId === 'string' ? this.taggedMessages.get(messageId) : messageId;
      if (!msgId) throw new Error(`Message not found: ${messageId}`);

      await this.bot.api.setMessageReaction(this.chatId, msgId, [
        { type: 'emoji', emoji: emoji as any },
      ]).catch(() => {});
    });
  }

  /** Get the message_id of the last message sent by the adapter. */
  getLastMessageId(): number | undefined {
    return this.lastSentMessageId;
  }

  /** Get the message_id associated with a previously tagged message. */
  getTaggedMessageId(tag: string): number | undefined {
    return this.taggedMessages.get(tag);
  }

  /** Incoming user message_id (for reply-to binding). */
  getUserMessageId(): number | undefined {
    return this.ctx.message?.message_id;
  }
}
