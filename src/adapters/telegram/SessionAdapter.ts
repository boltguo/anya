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
import type { AnyaConfig } from '../../config/defaults.js';
import { agentLogger } from '../../lib/logger.js';
import { markdownToTelegramV2 } from '../../lib/tgFormat.js';
import { stripMarkdown, splitMarkdownForTelegram } from './markdown.js';
import type { SendMessageOptions, PendingApproval, PendingChoice } from './types.js';

export class TelegramSessionAdapter implements Adapter {
  readonly platform = 'telegram' as const;
  private ctx: Context;
  private bot: Bot;
  private config: AnyaConfig;
  private pendingApprovals: Map<string, PendingApproval>;
  private pendingChoices: Map<string, PendingChoice>;

  // Maps user-defined tags to Telegram message_id for later reference.
  private taggedMessages = new Map<string, number>();
  private lastSentMessageId?: number;

  // ALL TG API calls go through this single queue.
  private outboundQueue = new PQueue({ concurrency: 1 });

  // A single message that gets created then edited in-place during tool exec.
  private statusMessageId?: number;
  private statusLines: string[] = [];

  // Set when any tg tool sends content. reply() checks this to skip duplicates.
  private hasSentContent = false;

  // Smart reply: first content message auto-replies to the user's message.
  private hasRepliedToUser = false;

  constructor(
    ctx: Context,
    bot: Bot,
    config: AnyaConfig,
    pendingApprovals: Map<string, PendingApproval>,
    pendingChoices: Map<string, PendingChoice>,
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

  /** Enqueue a TG API call to guarantee strict ordering of outbound messages. */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return this.outboundQueue.add(fn, { throwOnTimeout: false }) as Promise<T>;
  }

  /** Resolve a message reference (numeric ID or string tag) to a Telegram message_id. */
  private resolveMessageId(ref?: number | string): number | undefined {
    if (!ref) return undefined;
    if (typeof ref === 'number') return ref;
    return this.taggedMessages.get(ref);
  }

  /**
   * Smart reply-to: resolves the reply target.
   * First content message in a turn auto-replies to the user's incoming message.
   * Subsequent messages in the same turn don't auto-reply (avoids reply-chain spam).
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
   * Converts markdown to MarkdownV2 via telegramify-markdown.
   * Falls back to plain text (stripped markdown) if MarkdownV2 parsing fails.
   * Long messages are automatically split at safe boundaries.
   * Skips sending if a `tg` tool already sent content (dedup).
   *
   * After sending, cleans up the tool status message.
   */
  async reply(content: string): Promise<void> {
    await this.outboundQueue.onIdle();

    if (!this.hasSentContent && content) {
      const replyTo = this.autoReplyTo();
      const replyParams = replyTo ? { message_id: replyTo } : undefined;
      const maxLen = 4000;

      const segments = splitMarkdownForTelegram(content, maxLen);

      for (let idx = 0; idx < segments.length; idx++) {
        const segment = segments[idx];
        const formatted = markdownToTelegramV2(segment);
        const rp = idx === 0 ? replyParams : undefined;

        const msg = await this.bot.api.sendMessage(this.chatId, formatted, {
          parse_mode: 'MarkdownV2',
          reply_parameters: rp,
        }).catch((err) => {
          agentLogger.warn({ msg: 'mdv2_parse_fallback', error: err?.message, formattedLen: formatted.length, segmentIdx: idx });
          return this.bot.api.sendMessage(this.chatId, stripMarkdown(segment), {
            reply_parameters: rp,
          }).catch(() => null);
        });
        if (msg) this.trackMessage(msg.message_id);
      }
    }

    if (this.statusMessageId) {
      await this.bot.api.deleteMessage(this.chatId, this.statusMessageId).catch(() => {});
      this.statusMessageId = undefined;
    }
  }

  // ── Status window (compact single-line, enqueued) ─────────────────────────

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
      this.statusLines = [`✅ ${toolName}`];
    }
    this.enqueue(() => this.flushStatus());
  }

  /**
   * Flush the status indicator to Telegram.
   * Creates a new status message on first call, edits in-place on subsequent calls.
   * Deletes the message if text is empty.
   */
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

  /**
   * Present an approval prompt with Allow/Deny/Always buttons.
   * Times out after 5 minutes, defaulting to 'deny'.
   */
  async requestApproval(description: string): Promise<'allow' | 'deny' | 'always'> {
    const approvalId = `approval_${Date.now()}`;
    const keyboard = new InlineKeyboard()
      .text('Allow', `${approvalId}:allow`)
      .text('Deny', `${approvalId}:deny`)
      .text('Always Allow', `${approvalId}:always`);

    const sent = await this.ctx.reply(`Approval Required\n\n${description}`, { reply_markup: keyboard });

    return new Promise<'allow' | 'deny' | 'always'>((resolve) => {
      this.pendingApprovals.set(approvalId, { resolve });
      setTimeout(() => {
        if (this.pendingApprovals.has(approvalId)) {
          this.pendingApprovals.delete(approvalId);
          this.bot.api.editMessageReplyMarkup(this.chatId, sent.message_id, { reply_markup: undefined }).catch(() => {});
          this.bot.api.editMessageText(this.chatId, sent.message_id, `Approval Required\n\n${description}\n\n⏱ 已超时`).catch(() => {});
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
          this.bot.api.editMessageText(this.chatId, sent.message_id, `${description}\n\n⏱ 已超时`).catch(() => {});
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

  /** Send a photo with optional caption. Accepts URL or local file path. */
  async sendPhoto(photo: string, caption?: string, opts?: SendMessageOptions): Promise<number> {
    return this.enqueue(async () => {
      const replyTo = this.autoReplyTo(opts?.replyTo);
      const parseMode = opts?.parseMode === 'none' ? undefined : (opts?.parseMode || 'HTML');
      const source = isAbsolute(photo) || photo.startsWith('.') ? new InputFile(photo) : photo;

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
   * Send a voice message (shows as voice bubble in Telegram).
   * Requires .ogg Opus format for the native voice bubble UI.
   * Voice is supplementary — does not set hasSentContent so text reply still flows.
   */
  async sendVoice(voicePath: string, opts?: SendMessageOptions): Promise<number> {
    return this.enqueue(async () => {
      const replyTo = this.autoReplyTo(opts?.replyTo);
      const source = new InputFile(voicePath);

      const msg = await this.bot.api.sendVoice(this.chatId, source, {
        reply_parameters: replyTo ? { message_id: replyTo } : undefined,
      });

      this.trackMessage(msg.message_id, opts?.tag);
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

  /** Send a native Telegram quiz poll with auto-scoring. */
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

  /** Send a message with force_reply markup (opens user's keyboard for free-text input). */
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

  /** Send a message with a persistent bottom reply keyboard. */
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

  /** Remove the bottom reply keyboard. */
  async removeKeyboard(text: string): Promise<number> {
    return this.enqueue(async () => {
      const msg = await this.bot.api.sendMessage(this.chatId, text, {
        reply_markup: { remove_keyboard: true },
      });

      this.trackMessage(msg.message_id);
      return msg.message_id;
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

  /** Edit only the inline keyboard buttons of an existing message. */
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

  /** Send an animated dice/emoji and return the random value. */
  async sendDice(emoji: string = '🎲'): Promise<{ messageId: number; value: number }> {
    return this.enqueue(async () => {
      const msg = await this.bot.api.sendDice(this.chatId, emoji as any);
      this.trackMessage(msg.message_id);
      return { messageId: msg.message_id, value: msg.dice!.value };
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

  /** Pin a message to the top of the chat. */
  async pin(messageId: number | string, silent: boolean = false): Promise<void> {
    return this.enqueue(async () => {
      const msgId = typeof messageId === 'string' ? this.taggedMessages.get(messageId) : messageId;
      if (!msgId) throw new Error(`Message not found: ${messageId}`);

      await this.bot.api.pinChatMessage(this.chatId, msgId, {
        disable_notification: silent,
      }).catch(() => {});
    });
  }

  /** Show a chat action indicator (typing, record_voice, etc). */
  async sendChatAction(action: string = 'typing'): Promise<void> {
    return this.enqueue(async () => {
      await this.bot.api.sendChatAction(this.chatId, action as any).catch(() => {});
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
