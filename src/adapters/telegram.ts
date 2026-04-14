/**
 * @module adapters/telegram
 * @description Anya's native Telegram adapter.
 *
 * ## Architecture
 *
 * ```
 * ┌──────────────────────────────────────────────────────────────────┐
 * │  TelegramAdapter (Singleton)                                    │
 * │  - Owns the grammy Bot instance and long-polling lifecycle      │
 * │  - Routes incoming messages & callback queries                  │
 * │  - Manages shared pendingApprovals / pendingChoices maps        │
 * │                                                                 │
 * │  ┌──────────────────────────────────────────────────────────┐    │
 * │  │ TelegramSessionAdapter (Per-request)                     │    │
 * │  │ - Created for each incoming message or callback          │    │
 * │  │ - Implements the Adapter interface for Agent.run()       │    │
 * │  │ - Owns outbound queue, message tags, and status window   │    │
 * │  └──────────────────────────────────────────────────────────┘    │
 * └──────────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## Key Design Patterns
 *
 * ### Unified Outbound Queue
 * ALL Telegram API calls go through {@link TelegramSessionAdapter.enqueue},
 * guaranteeing strict message ordering and preventing race conditions.
 *
 * ### Smart Reply
 * The first content message in each turn automatically replies to the
 * user's incoming message (visual reply threading). Subsequent messages
 * in the same turn flow normally without reply-to.
 *
 * ### Status Window (Rolling UI)
 * During tool execution, a single "status message" is created and
 * continuously edited in-place to show progress. When the Agent produces
 * its final reply(), the status message is automatically deleted.
 *
 * ### Message Tagging
 * Send methods accept a `tag` parameter to name messages for later
 * reference (edit, reply-to, pin):
 *   tg({ type: "text", text: "...", tag: "q1" })
 *   tg({ type: "edit", message_id: "q1", text: "..." })
 *
 * ### Callback Routing (3-tier)
 * When a user clicks an inline keyboard button:
 *   1. `approval_*` → resolves a pending requestApproval() promise
 *   2. `choice_*`   → resolves a pending requestChoice() promise
 *   3. Other        → generic handler: feeds `[callback] <data>` into Agent.run()
 *
 * ### Deduplication
 * The `hasSentContent` flag tracks whether any tg tool has already sent
 * content during this turn. If so, `reply()` skips the final text delivery,
 * preventing duplicates.
 */

import { Bot, InlineKeyboard, InputFile, Context } from 'grammy';
import type { Adapter } from '../agent/types.js';
import type { AnyaConfig } from '../config/defaults.js';
import { Agent, type RunResult } from '../agent/Agent.js';
import { agentLogger } from '../lib/logger.js';
import { createSession } from '../storage/sessionStore.js';
import { transcribeAudio } from '../lib/stt.js';
import { analyzeImage } from '../lib/vision.js';
import { AUDIO_CACHE_DIR } from '../lib/paths.js';
import { markdownToTelegramHtml } from '../lib/tgFormat.js';
import fs from 'node:fs';
import path from 'node:path';

// ── Types ────────────────────────────────────────────────────────────────────

interface SendMessageOptions {
  parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML' | 'none';
  replyTo?: number | string; // message_id or tag name
  tag?: string; // tag this message for later reference (edit, pin, reply-to)
}

interface InlineButtonRow {
  label: string;
  data: string;
}

// ── TelegramSessionAdapter ──────────────────────────────────────────────────
//
// Per-request adapter: each incoming TG message/callback creates one of these.
// It owns all interaction state (tagged messages, status window) for that turn.
// Destroyed after Agent.run() completes — state does not persist across turns.

export class TelegramSessionAdapter implements Adapter {
  private ctx: Context;
  private bot: Bot;
  private config: AnyaConfig;
  private pendingApprovals: Map<string, { resolve: (value: 'allow' | 'deny' | 'always') => void }>;
  private pendingChoices: Map<string, { resolve: (value: string) => void }>;

  // ── Message tracking ──
  // Maps user-defined tags to Telegram message_id for later reference (edit, reply-to, pin)
  private taggedMessages = new Map<string, number>();
  private lastSentMessageId?: number;

  // ── Unified outbound queue ──
  // ALL TG API calls go through this single queue to guarantee:
  //   1. Strict ordering (题目 → 音频 → 键盘 arrive in order)
  //   2. No race conditions (only one API call at a time)
  //   3. Automatic dedup (reply() checks hasSentContent set by any prior send)
  private outboundQueue: Promise<void> = Promise.resolve();

  // ── Status window (tool execution feedback) ──
  // A single message that gets created then edited in-place during tool execution.
  private statusMessageId?: number;
  private statusLines: string[] = [];

  // Set to true when any tg tool sends content. reply() checks this to skip duplicate delivery.
  private hasSentContent = false;

  // Smart reply: first content message in a turn auto-replies to the user's incoming message.
  private hasRepliedToUser = false;

  constructor(
    ctx: Context,
    bot: Bot,
    config: AnyaConfig,
    pendingApprovals: Map<string, { resolve: (value: 'allow' | 'deny' | 'always') => void }>,
    pendingChoices: Map<string, { resolve: (value: string) => void }>
  ) {
    this.ctx = ctx;
    this.bot = bot;
    this.config = config;
    this.pendingApprovals = pendingApprovals;
    this.pendingChoices = pendingChoices;
  }

  private get chatId(): number {
    return this.ctx.chat!.id;
  }

  // ── Queue infrastructure ──────────────────────────────────────────────────

  /**
   * Enqueue an async operation onto the outbound queue.
   * All operations are executed sequentially — the next one starts only after
   * the previous one completes. Returns the result of the operation.
   */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });

    this.outboundQueue = this.outboundQueue
      .then(() => fn().then(resolve, reject))
      .catch(() => {}); // prevent unhandled rejection on queue chain

    return promise;
  }

  /**
   * Resolve a replyTo value (number or tag) into a Telegram message_id.
   */
  private resolveMessageId(ref?: number | string): number | undefined {
    if (!ref) return undefined;
    if (typeof ref === 'number') return ref;
    return this.taggedMessages.get(ref);
  }

  /**
   * Auto-reply: if this is the first content message and no explicit replyTo
   * was provided, reply to the user's incoming message.
   */
  private autoReplyTo(explicitReplyTo?: number | string): number | undefined {
    const resolved = this.resolveMessageId(explicitReplyTo);
    if (resolved) return resolved;

    // First content message → reply to the user's message
    if (!this.hasRepliedToUser) {
      this.hasRepliedToUser = true;
      return this.getUserMessageId();
    }
    return undefined;
  }

  /**
   * Track a sent message: store in taggedMessages if tag is provided, always update lastSentMessageId.
   */
  private trackMessage(messageId: number, tag?: string): void {
    this.lastSentMessageId = messageId;
    if (tag) {
      this.taggedMessages.set(tag, messageId);
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  //  Core Adapter Interface (reply, showToolCall, showToolResult, requestApproval, requestChoice)
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Final reply — called by Gateway handler after Agent.run() completes.
   * If any tg_* tool already sent content during this turn, the text delivery
   * is skipped (dedup). Status window cleanup always happens.
   */
  async reply(content: string): Promise<void> {
    // Wait for the entire queue to drain — all tool sends and status updates
    await this.outboundQueue;

    if (!this.hasSentContent && content) {
      const replyTo = this.autoReplyTo();
      const replyParams = replyTo ? { message_id: replyTo } : undefined;
      const html = markdownToTelegramHtml(content);
      const maxLen = 4000;
      if (html.length <= maxLen) {
        const msg = await this.bot.api.sendMessage(this.chatId, html, {
          parse_mode: 'HTML',
          reply_parameters: replyParams,
        }).catch(() =>
          // Fallback: send as plain text if HTML parsing fails
          this.bot.api.sendMessage(this.chatId, content, {
            reply_parameters: replyParams,
          })
        );
        if (msg) this.trackMessage(msg.message_id);
      } else {
        // Split long messages into chunks
        for (let i = 0; i < html.length; i += maxLen) {
          const chunk = html.substring(i, i + maxLen);
          const rp = i === 0 ? replyParams : undefined;
          const msg = await this.bot.api.sendMessage(this.chatId, chunk, {
            parse_mode: 'HTML',
            reply_parameters: rp,
          }).catch(() =>
            this.bot.api.sendMessage(this.chatId, content.substring(i, i + maxLen), {
              reply_parameters: rp,
            }).catch(() => null)
          );
          if (msg) this.trackMessage(msg.message_id);
        }
      }
    }

    // Always clean up the status window
    if (this.statusMessageId) {
      await this.bot.api.deleteMessage(this.chatId, this.statusMessageId).catch(() => {});
      this.statusMessageId = undefined;
    }
  }

  // ── Status window (compact single-line, enqueued) ───────────────────────────

  private static TOOL_EMOJI: Record<string, string> = {
    read_file: '📄', write_file: '✏️', list_dir: '📁',
    shell: '💻', web_search: '🔍', memory_update: '🧠',
    skill_manage: '🧩', skill_view: '🧩', clarify: '💬',
    tg: '💬',
  };

  showToolCall(toolName: string, _args: Record<string, unknown>): void {
    const emoji = TelegramSessionAdapter.TOOL_EMOJI[toolName] || '⚙️';
    this.statusLines = [`${emoji} ${toolName}...`];
    this.enqueue(() => this.flushStatus());
  }

  showToolResult(toolName: string, _result: string, isError: boolean): void {
    if (isError) {
      this.statusLines = [`❌ ${toolName} failed`];
    } else {
      // Show brief checkmark — will be replaced by next tool or deleted by reply()
      this.statusLines = [`✅ ${toolName}`];
    }
    this.enqueue(() => this.flushStatus());
  }

  private async flushStatus(): Promise<void> {
    const text = this.statusLines.join('\n');
    if (!text && this.statusMessageId) {
      await this.bot.api.deleteMessage(this.chatId, this.statusMessageId).catch(() => {});
      this.statusMessageId = undefined;
      return;
    }
    if (!text) return;

    if (!this.statusMessageId) {
      const msg = await this.ctx.reply(text, { parse_mode: undefined }).catch(() => null);
      if (msg) this.statusMessageId = msg.message_id;
    } else {
      await this.bot.api.editMessageText(this.chatId, this.statusMessageId, text).catch(() => {});
    }
  }

  async requestApproval(description: string): Promise<'allow' | 'deny' | 'always'> {
    const approvalId = `approval_${Date.now()}`;
    const keyboard = new InlineKeyboard()
      .text('Allow', `${approvalId}:allow`)
      .text('Deny', `${approvalId}:deny`)
      .text('Always Allow', `${approvalId}:always`);

    await this.ctx.reply(`Approval Required\n\n${description}`, { reply_markup: keyboard });

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

    await this.ctx.reply(description, { reply_markup: keyboard });

    return new Promise<string>((resolve) => {
      this.pendingChoices.set(choiceKey, { resolve });
      setTimeout(() => {
        if (this.pendingChoices.has(choiceKey)) {
          this.pendingChoices.delete(choiceKey);
          resolve('');
        }
      }, 10 * 60 * 1000);
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  //  Native Telegram Capabilities (all enqueued for ordering & dedup)
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Send a text message. Enqueued to guarantee ordering with other sends.
   */
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

  /**
   * Send a photo with optional caption. Enqueued.
   */
  async sendPhoto(photo: string, caption?: string, opts?: SendMessageOptions): Promise<number> {
    return this.enqueue(async () => {
      const replyTo = this.autoReplyTo(opts?.replyTo);
      const parseMode = opts?.parseMode === 'none' ? undefined : (opts?.parseMode || 'HTML');
      const source = photo.startsWith('/') || photo.startsWith('.') ? new InputFile(photo) : photo;

      const msg = await this.bot.api.sendPhoto(this.chatId, source, {
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
   * Send an audio file with optional caption. Enqueued.
   */
  async sendAudio(audio: string, caption?: string, opts?: SendMessageOptions): Promise<number> {
    return this.enqueue(async () => {
      const replyTo = this.autoReplyTo(opts?.replyTo);
      const parseMode = opts?.parseMode === 'none' ? undefined : (opts?.parseMode || 'HTML');
      const source = audio.startsWith('/') || audio.startsWith('.') ? new InputFile(audio) : audio;

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
   * Send a message with an InlineKeyboard. Enqueued.
   */
  async sendKeyboard(text: string, buttons: string[][], opts?: SendMessageOptions): Promise<number> {
    return this.enqueue(async () => {
      const replyTo = this.autoReplyTo(opts?.replyTo);
      const parseMode = opts?.parseMode === 'none' ? undefined : (opts?.parseMode || 'HTML');

      const keyboard = new InlineKeyboard();
      for (const row of buttons) {
        for (const btn of row) {
          const parts = btn.split('|', 2);
          const label = parts[0];
          const data = parts.length > 1 ? parts[1] : parts[0];
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

  /**
   * Send a native Telegram quiz poll. Enqueued.
   */
  async sendQuiz(question: string, options: string[], correctIndex: number, explanation?: string, openPeriod?: number): Promise<{ messageId: number; pollId: string }> {
    return this.enqueue(async () => {
      const msg = await this.bot.api.sendPoll(this.chatId, question, options, {
        type: 'quiz',
        correct_option_id: correctIndex,
        is_anonymous: false,
        explanation: explanation || undefined,
        open_period: openPeriod || undefined,
      });

      this.trackMessage(msg.message_id);
      this.hasSentContent = true;
      return { messageId: msg.message_id, pollId: msg.poll!.id };
    });
  }

  /**
   * Send a message with ForceReply. Enqueued.
   */
  async sendForceReply(text: string, opts?: SendMessageOptions): Promise<number> {
    return this.enqueue(async () => {
      const replyTo = this.autoReplyTo(opts?.replyTo);

      const msg = await this.bot.api.sendMessage(this.chatId, text, {
        parse_mode: 'HTML',
        reply_markup: { force_reply: true, selective: true },
        reply_parameters: replyTo ? { message_id: replyTo } : undefined,
      });

      this.trackMessage(msg.message_id, opts?.tag);
      this.hasSentContent = true;
      return msg.message_id;
    });
  }

  /**
   * Send a persistent ReplyKeyboard (bottom keyboard menu). Enqueued.
   */
  async sendReplyKeyboard(text: string, buttons: string[][], opts?: { persistent?: boolean; oneTime?: boolean; tag?: string }): Promise<number> {
    return this.enqueue(async () => {
      const keyboard = buttons.map(row => row.map(label => ({ text: label })));

      const msg = await this.bot.api.sendMessage(this.chatId, text, {
        reply_markup: {
          keyboard,
          resize_keyboard: true,
          is_persistent: opts?.oneTime ? false : (opts?.persistent ?? true),
          one_time_keyboard: opts?.oneTime ?? false,
        },
      });

      this.trackMessage(msg.message_id, opts?.tag);
      this.hasSentContent = true;
      return msg.message_id;
    });
  }

  /**
   * Remove the reply keyboard. Enqueued.
   */
  async removeKeyboard(text: string): Promise<number> {
    return this.enqueue(async () => {
      const msg = await this.bot.api.sendMessage(this.chatId, text, {
        reply_markup: { remove_keyboard: true },
      });

      this.trackMessage(msg.message_id);
      return msg.message_id;
    });
  }

  /**
  /**
   * Edit an existing message's text (and optionally its inline keyboard). Enqueued.
   */
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
            keyboard.text(parts[0], parts.length > 1 ? parts[1] : parts[0]);
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

  /**
   * Edit only the inline keyboard of an existing message. Enqueued.
   */
  async editKeyboard(messageId: number | string, buttons: string[][]): Promise<void> {
    return this.enqueue(async () => {
      const msgId = typeof messageId === 'string' ? this.taggedMessages.get(messageId) : messageId;
      if (!msgId) throw new Error(`Message not found: ${messageId}`);

      const keyboard = new InlineKeyboard();
      for (const row of buttons) {
        for (const btn of row) {
          const parts = btn.split('|', 2);
          keyboard.text(parts[0], parts.length > 1 ? parts[1] : parts[0]);
        }
        keyboard.row();
      }

      await this.bot.api.editMessageReplyMarkup(this.chatId, msgId, {
        reply_markup: buttons.length > 0 ? keyboard : undefined,
      }).catch(() => {});
    });
  }

  /**
   * Send an animated dice. Enqueued.
   */
  async sendDice(emoji: string = '🎲'): Promise<{ messageId: number; value: number }> {
    return this.enqueue(async () => {
      const msg = await this.bot.api.sendDice(this.chatId, emoji as any);
      this.trackMessage(msg.message_id);
      return { messageId: msg.message_id, value: msg.dice!.value };
    });
  }

  /**
   * Add an emoji reaction to a message. Enqueued.
   */
  async react(messageId: number | string, emoji: string): Promise<void> {
    return this.enqueue(async () => {
      const msgId = typeof messageId === 'string' ? this.taggedMessages.get(messageId) : messageId;
      if (!msgId) throw new Error(`Message not found: ${messageId}`);

      await this.bot.api.setMessageReaction(this.chatId, msgId, [
        { type: 'emoji', emoji: emoji as any },
      ]).catch(() => {});
    });
  }

  /**
   * Pin a message to the top of the chat. Enqueued.
   */
  async pin(messageId: number | string, silent: boolean = false): Promise<void> {
    return this.enqueue(async () => {
      const msgId = typeof messageId === 'string' ? this.taggedMessages.get(messageId) : messageId;
      if (!msgId) throw new Error(`Message not found: ${messageId}`);

      await this.bot.api.pinChatMessage(this.chatId, msgId, {
        disable_notification: silent,
      }).catch(() => {});
    });
  }

  /**
   * Show a chat action indicator (typing, etc.). Enqueued.
   */
  async sendChatAction(action: string = 'typing'): Promise<void> {
    return this.enqueue(async () => {
      await this.bot.api.sendChatAction(this.chatId, action as any).catch(() => {});
    });
  }

  /**
   * Get the last sent message_id.
   */
  getLastMessageId(): number | undefined {
    return this.lastSentMessageId;
  }

  /**
   * Get a tagged message_id.
   */
  getTaggedMessageId(tag: string): number | undefined {
    return this.taggedMessages.get(tag);
  }

  /**
   * Get the incoming user message_id (for reply-to binding).
   */
  getUserMessageId(): number | undefined {
    return this.ctx.message?.message_id;
  }
}

// ── Typing Indicator ─────────────────────────────────────────────────────────
// Telegram "typing..." status expires after ~5s, so we repeat every 4s.

function startTypingIndicator(ctx: Context): ReturnType<typeof setInterval> {
  const send = () => ctx.replyWithChatAction('typing').catch(() => {});
  send(); // Send immediately
  return setInterval(send, 4000);
}

// ── Error Formatting ─────────────────────────────────────────────────────────
// Extracts human-readable messages from API errors instead of dumping raw JSON.

function formatTgError(error: Error): string {
  const msg = error.message || '';

  // Gemini 429 rate limit
  if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
    return '⚠️ API 请求次数已用完，请稍后再试。';
  }

  // Gemini auth / key error
  if (msg.includes('401') || msg.includes('403') || msg.includes('API_KEY_INVALID')) {
    return '⚠️ API Key 无效或已过期，请运行 anya config edit 更新。';
  }

  // Generic server errors
  if (msg.includes('500') || msg.includes('502') || msg.includes('503')) {
    return '⚠️ API 服务暂时不可用，请稍后重试。';
  }

  // Fallback: truncate to avoid huge messages, strip URLs
  const clean = msg.replace(/https?:\/\/[^\s"]+/g, '[link]').substring(0, 200);
  return `⚠️ ${clean}`;
}

// ── TelegramAdapter (top-level bot manager) ──────────────────────────────────

export class TelegramAdapter {
  private bot: Bot;
  private config: AnyaConfig;
  private pendingApprovals = new Map<string, {
    resolve: (value: 'allow' | 'deny' | 'always') => void;
  }>();
  private pendingChoices = new Map<string, {
    resolve: (value: string) => void;
  }>();

  constructor(config: AnyaConfig) {
    if (!config.telegram.bot_token) {
      throw new Error('Telegram bot_token not configured. Run "anya init" or "anya config edit".');
    }

    this.config = config;
    this.bot = new Bot(config.telegram.bot_token);
  }

  async start(): Promise<void> {
    const allowedUsers = this.config.telegram.allowed_user_ids;

    // ── Bot commands (registered BEFORE message:text so they take priority) ──

    this.bot.command('start', async (ctx) => {
      await ctx.reply(`Hi! I'm ${this.config.agent.name}, your personal AI assistant.\n\nSend me any message and I'll help you with it.\n\nCommands:\n/new - Start a new conversation`);
    });

    this.bot.command('new', async (ctx) => {
      const sessionKey = `tg:${ctx.chat.id}`;
      createSession(sessionKey);
      await ctx.reply('🔄 New session started.');
      agentLogger.info({ msg: 'tg_new_session', chatId: ctx.chat.id });
      console.log(`[gateway] new session: chat ${ctx.chat.id}`);
    });

    // ── Message handler ──

    this.bot.on('message:text', async (ctx) => {
      const userId = ctx.from?.id;

      if (allowedUsers.length > 0 && userId && !allowedUsers.includes(userId)) {
        await ctx.reply('Unauthorized. Your user ID is not in the allowed list.');
        agentLogger.warn({ msg: 'unauthorized_user', userId, chatId: ctx.chat.id });
        return;
      }

      const sessionKey = `tg:${ctx.chat.id}`;
      const input = ctx.message.text;

      agentLogger.info({ msg: 'tg_message', chatId: ctx.chat.id, userId, text: input.substring(0, 100) });

      // Show "typing..." indicator while processing
      const typingInterval = startTypingIndicator(ctx);

      const sessionAdapter = new TelegramSessionAdapter(ctx, this.bot, this.config, this.pendingApprovals, this.pendingChoices);
      const agent = new Agent(this.config, sessionAdapter);

      try {
        const result: RunResult = await agent.run(input, { sessionKey });
        if (!result.tgSent && result.content) {
          await sessionAdapter.reply(result.content);
        }
      } catch (err) {
        const error = err as Error;
        agentLogger.error({ msg: 'tg_error', chatId: ctx.chat.id, error: error.message });
        await ctx.reply(formatTgError(error), { link_preview_options: { is_disabled: true } });
      } finally {
        clearInterval(typingInterval);
      }
    });

    // ── Voice message handler ──

    this.bot.on('message:voice', async (ctx) => {
      const userId = ctx.from?.id;

      if (allowedUsers.length > 0 && userId && !allowedUsers.includes(userId)) {
        await ctx.reply('Unauthorized.');
        return;
      }

      const sessionKey = `tg:${ctx.chat.id}`;
      agentLogger.info({ msg: 'tg_voice', chatId: ctx.chat.id, userId, duration: ctx.message.voice.duration });

      // Download voice file
      let audioPath: string;
      try {
        const file = await ctx.getFile();
        const fileUrl = `https://api.telegram.org/file/bot${this.config.telegram.bot_token}/${file.file_path}`;
        const response = await fetch(fileUrl);
        if (!response.ok) throw new Error(`Download failed: ${response.status}`);

        const buffer = Buffer.from(await response.arrayBuffer());
        const timestamp = Date.now();
        audioPath = path.join(AUDIO_CACHE_DIR, `voice_${timestamp}.ogg`);
        fs.mkdirSync(AUDIO_CACHE_DIR, { recursive: true });
        fs.writeFileSync(audioPath, buffer);
        agentLogger.info({ msg: 'tg_voice_cached', path: audioPath, bytes: buffer.length });
      } catch (err) {
        const error = err as Error;
        agentLogger.error({ msg: 'tg_voice_download_error', error: error.message });
        await ctx.reply('❌ 语音下载失败，请重试。');
        return;
      }

      // Transcribe
      const sttResult = await transcribeAudio(audioPath, this.config);

      if (!sttResult.success || !sttResult.transcript) {
        const errMsg = sttResult.error || '无法识别语音内容';
        agentLogger.warn({ msg: 'tg_stt_failed', error: errMsg });
        await ctx.reply(`🎤 ${errMsg}`);
        // Clean up
        fs.unlink(audioPath, () => {});
        return;
      }

      // Inject transcribed text as user input
      const input = `[语音消息: "${sttResult.transcript}"]`;
      agentLogger.info({ msg: 'tg_voice_transcribed', chatId: ctx.chat.id, provider: sttResult.provider, text: sttResult.transcript.substring(0, 100) });

      // Show "typing..." indicator while processing
      const typingInterval = startTypingIndicator(ctx);

      const sessionAdapter = new TelegramSessionAdapter(ctx, this.bot, this.config, this.pendingApprovals, this.pendingChoices);
      const agent = new Agent(this.config, sessionAdapter);

      try {
        const result: RunResult = await agent.run(input, { sessionKey });
        if (!result.tgSent && result.content) {
          await sessionAdapter.reply(result.content);
        }
      } catch (err) {
        const error = err as Error;
        agentLogger.error({ msg: 'tg_error', chatId: ctx.chat.id, error: error.message });
        await ctx.reply(formatTgError(error), { link_preview_options: { is_disabled: true } });
      } finally {
        clearInterval(typingInterval);
        // Clean up cached audio
        fs.unlink(audioPath, () => {});
      }
    });

    // ── Photo message handler ──

    this.bot.on('message:photo', async (ctx) => {
      const userId = ctx.from?.id;

      if (allowedUsers.length > 0 && userId && !allowedUsers.includes(userId)) {
        await ctx.reply('Unauthorized.');
        return;
      }

      const sessionKey = `tg:${ctx.chat.id}`;
      const caption = ctx.message.caption || '';

      agentLogger.info({ msg: 'tg_photo', chatId: ctx.chat.id, userId, caption: caption.substring(0, 100) });

      // Show typing while processing
      const typingInterval = startTypingIndicator(ctx);

      // Download the largest photo size
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      let imagePath = '';

      try {
        const file = await ctx.api.getFile(photo.file_id);

        if (!file.file_path) {
          clearInterval(typingInterval);
          await ctx.reply('❌ 无法获取图片文件。');
          return;
        }

        // Download via Telegram file URL
        const fileUrl = `https://api.telegram.org/file/bot${this.config.telegram.bot_token}/${file.file_path}`;
        const response = await fetch(fileUrl);

        if (!response.ok) {
          clearInterval(typingInterval);
          await ctx.reply('❌ 图片下载失败。');
          return;
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        const ext = path.extname(file.file_path) || '.jpg';
        imagePath = path.join(AUDIO_CACHE_DIR, `photo_${Date.now()}${ext}`);
        fs.writeFileSync(imagePath, buffer);

        agentLogger.info({ msg: 'tg_photo_cached', path: imagePath, bytes: buffer.length });
      } catch (err) {
        clearInterval(typingInterval);
        const error = err as Error;
        agentLogger.error({ msg: 'tg_photo_download_error', error: error.message });
        await ctx.reply('❌ 图片下载失败，请重试。');
        return;
      }

      // Analyze image via Gemini Flash
      const visionResult = await analyzeImage(imagePath, this.config, caption || undefined);

      if (!visionResult.success || !visionResult.description) {
        clearInterval(typingInterval);
        const errMsg = visionResult.error || '无法分析图片内容';
        agentLogger.warn({ msg: 'tg_vision_failed', error: errMsg });
        await ctx.reply(`🖼️ ${errMsg}`);
        fs.unlink(imagePath, () => {});
        return;
      }

      // Inject description as user input
      const input = caption
        ? `[用户发送了一张图片，附带说明: "${caption}"]\n[图片分析: ${visionResult.description}]`
        : `[用户发送了一张图片]\n[图片分析: ${visionResult.description}]`;

      agentLogger.info({ msg: 'tg_vision_done', chatId: ctx.chat.id, descLength: visionResult.description.length });

      const sessionAdapter = new TelegramSessionAdapter(ctx, this.bot, this.config, this.pendingApprovals, this.pendingChoices);
      const agent = new Agent(this.config, sessionAdapter);

      try {
        const result: RunResult = await agent.run(input, { sessionKey });
        if (!result.tgSent && result.content) {
          await sessionAdapter.reply(result.content);
        }
      } catch (err) {
        const error = err as Error;
        agentLogger.error({ msg: 'tg_error', chatId: ctx.chat.id, error: error.message });
        await ctx.reply(formatTgError(error), { link_preview_options: { is_disabled: true } });
      } finally {
        clearInterval(typingInterval);
        // Clean up cached image
        fs.unlink(imagePath, () => {});
      }
    });

    // ── Callback query dispatcher (approvals + choices + custom) ──
    this.bot.on('callback_query:data', async (ctx) => {
      const data = ctx.callbackQuery.data;

      // Approval callback
      if (data.startsWith('approval_')) {
        const sepIdx = data.indexOf(':');
        const approvalId = data.substring(0, sepIdx);
        const action = data.substring(sepIdx + 1);
        const pending = this.pendingApprovals.get(approvalId);
        if (pending) {
          this.pendingApprovals.delete(approvalId);
          pending.resolve(action as 'allow' | 'deny' | 'always');

          const statusText = action === 'allow' ? 'Allowed' : action === 'always' ? 'Always Allowed' : 'Denied';
          await ctx.editMessageText(
            ctx.callbackQuery.message?.text + `\n\n-> ${statusText}`
          ).catch(() => {});
        }
      }
      // Choice callback
      else if (data.startsWith('choice_')) {
        const sepIdx = data.indexOf(':');
        const choiceId = data.substring(0, sepIdx);
        const pending = this.pendingChoices.get(choiceId);
        if (pending) {
          this.pendingChoices.delete(choiceId);

          // Resolve the original label text from the inline keyboard
          const inlineKeyboard = ctx.callbackQuery.message?.reply_markup?.inline_keyboard;
          let selectedText = '';
          if (inlineKeyboard) {
            for (const row of inlineKeyboard) {
              for (const btn of row) {
                if (btn.callback_data === data) {
                  selectedText = btn.text;
                }
              }
            }
          }

          pending.resolve(selectedText);
          await ctx.editMessageText(
            ctx.callbackQuery.message?.text + `\n\n-> ${selectedText || 'Selected'}`
          ).catch(() => {});
        }
      }
      // ── Generic callback (from tg_keyboard tool) ──
      // Route unmatched button clicks back into the Agent as a new user input.
      else {
        const userId = ctx.from?.id;
        if (allowedUsers.length > 0 && userId && !allowedUsers.includes(userId)) {
          await ctx.answerCallbackQuery();
          return;
        }

        // Resolve the button label for display
        const inlineKeyboard = ctx.callbackQuery.message?.reply_markup?.inline_keyboard;
        let selectedLabel = data;
        if (inlineKeyboard) {
          for (const row of inlineKeyboard) {
            for (const btn of row) {
              if (btn.callback_data === data) {
                selectedLabel = btn.text;
              }
            }
          }
        }

        // Update the message to show what was selected
        await ctx.editMessageText(
          ctx.callbackQuery.message?.text + `\n\n→ ${selectedLabel}`
        ).catch(() => {});

        // Feed the callback_data back into the Agent as a new conversation turn
        const chatId = ctx.callbackQuery.message?.chat?.id;
        if (chatId) {
          const sessionKey = `tg:${chatId}`;
          const agentInput = `[callback] ${data}`;

          agentLogger.info({ msg: 'tg_callback', chatId, userId, data, label: selectedLabel });
          console.log(`[gateway] callback: ${selectedLabel} (${data})`);

          const sessionAdapter = new TelegramSessionAdapter(ctx as any, this.bot, this.config, this.pendingApprovals, this.pendingChoices);
          const agent = new Agent(this.config, sessionAdapter);

          try {
            const result: RunResult = await agent.run(agentInput, { sessionKey });
            // Use sessionAdapter.reply() — same path as message handler.
            // reply() internally checks hasSentContent to avoid duplicates.
            await sessionAdapter.reply(result.content);
          } catch (err) {
            const error = err as Error;
            agentLogger.error({ msg: 'tg_callback_error', chatId, error: error.message });
            await this.bot.api.sendMessage(chatId, formatTgError(error), { link_preview_options: { is_disabled: true } }).catch(() => {});
          }
        }
      }

      await ctx.answerCallbackQuery();
    });



    agentLogger.info({ msg: 'tg_bot_starting' });
    console.log('[gateway] Telegram bot starting...');

    await this.bot.start({
      onStart: (info) => {
        console.log(`[gateway] Bot @${info.username} is running`);
        agentLogger.info({ msg: 'tg_bot_started', username: info.username });
      },
    });
  }

  stop(): void {
    this.bot.stop();
  }
}
