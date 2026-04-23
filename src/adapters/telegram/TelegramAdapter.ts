/**
 * @module adapters/telegram/TelegramAdapter
 * @description Top-level Telegram bot manager.
 *
 * Owns the grammy {@link Bot} instance and long-polling lifecycle, registers
 * commands and message/callback handlers, and spawns one
 * {@link TelegramSessionAdapter} per incoming turn.
 *
 * Routing for callback queries is 3-tier:
 *   1. `approval_*` → resolves a pending requestApproval() promise
 *   2. `choice_*`   → resolves a pending requestChoice() promise
 *   3. Other        → feeds `[callback] <data>` into Agent.run() as a new turn
 */

import { Bot, type Context } from 'grammy';
import { Agent, type RunResult } from '../../agent/Agent.js';
import { registerAllTools } from '../../tools/registry.js';
import { agentLogger } from '../../lib/logger.js';
import { trackStt } from '../../lib/usage.js';
import { loadSkills } from '../../skills/loader.js';
import { createSession } from '../../storage/sessionStore.js';
import { transcribeAudio } from '../../lib/stt.js';
import { analyzeImage } from '../../lib/vision.js';
import { AUDIO_CACHE_DIR, VOICE_DIR, IMAGE_RECEIVED_DIR } from '../../lib/paths.js';
import type { AnyaConfig } from '../../config/defaults.js';
import fs from 'node:fs';
import path from 'node:path';

import { TelegramSessionAdapter } from './SessionAdapter.js';
import type { PendingApproval, PendingChoice } from './types.js';
import { formatTgError, startTypingIndicator } from './errors.js';
import { isNavCallback, getNavPage, getMainMenu } from './skillMenu.js';

/**
 * TelegramAdapter — the top-level bot manager.
 *
 * Creates the grammy Bot, registers command and message handlers, and
 * manages the long-polling lifecycle. Spawns a fresh {@link TelegramSessionAdapter}
 * for each incoming turn.
 */
export class TelegramAdapter {
  private bot: Bot;
  private config: AnyaConfig;
  /** Pending approval dialogs, keyed by approval ID. Resolved by callback_query handler. */
  private pendingApprovals = new Map<string, PendingApproval>();
  /** Pending choice dialogs, keyed by choice ID. Resolved by callback_query handler. */
  private pendingChoices = new Map<string, PendingChoice>();
  /**
   * Per-chat serial queue. Two messages in the same chat cannot run
   * Agent.run concurrently — that would race on the shared tg:<chatId>
   * history and let status messages collide.
   */
  private chatQueue = new Map<number, Promise<void>>();

  constructor(config: AnyaConfig) {
    if (!config.telegram.bot_token) {
      throw new Error('Telegram bot_token not configured. Run "anya init" or "anya config edit".');
    }

    this.config = config;
    this.bot = new Bot(config.telegram.bot_token);
  }

  /**
   * Cancel all pending approvals and choices.
   * Resolves approvals as 'deny', choices as empty string.
   * @returns number of cancelled items.
   */
  private cancelPending(): number {
    let count = 0;
    for (const [id, pending] of this.pendingApprovals) {
      pending.resolve('deny');
      count++;
    }
    this.pendingApprovals.clear();
    for (const [id, pending] of this.pendingChoices) {
      pending.resolve('');
      count++;
    }
    this.pendingChoices.clear();
    return count;
  }

  /**
   * Try to resolve a pending approval from a reply keyboard text.
   * @returns true if the text was an approval response and was handled.
   */
  private tryResolveApproval(text: string): boolean {
    const trimmed = text.trim();
    let action: 'allow' | 'deny' | 'always' | null = null;

    if (trimmed === '✅ Allow') action = 'allow';
    else if (trimmed === '❌ Deny') action = 'deny';
    else if (trimmed === '🔓 Always Allow') action = 'always';

    if (!action || this.pendingApprovals.size === 0) return false;

    // Resolve the most recent pending approval
    const entries = [...this.pendingApprovals.entries()];
    const [id, pending] = entries[entries.length - 1];
    this.pendingApprovals.delete(id);
    pending.resolve(action);
    return true;
  }

  /**
   * Chain `task` onto the serial queue for this chat. Returns immediately;
   * the task runs after any earlier turn for the same chat finishes.
   * Errors are logged — they never propagate out, so the queue stays live.
   */
  private enqueuePerChat(chatId: number, task: () => Promise<void>): void {
    const prev = this.chatQueue.get(chatId) ?? Promise.resolve();
    const next = prev.then(task).catch((err) => {
      agentLogger.error({ msg: 'tg_queue_task_error', chatId, error: (err as Error).message });
    });
    this.chatQueue.set(chatId, next);
    next.then(() => {
      if (this.chatQueue.get(chatId) === next) {
        this.chatQueue.delete(chatId);
      }
    });
  }

  /**
   * Common message-handling pipeline shared by text, voice, and photo handlers.
   * Extracts: auth → typing → adapter + agent → run → reply → error handling.
   */
  private async handleIncoming(
    ctx: Context,
    input: string,
    cleanup?: () => void,
  ): Promise<void> {
    const userId = ctx.from?.id;
    const allowedUsers = this.config.telegram.allowed_user_ids;

    if (allowedUsers.length > 0 && userId && !allowedUsers.includes(userId)) {
      await ctx.reply('⛔ Unauthorized. Your user ID is not in the allowed list.');
      agentLogger.warn({ msg: 'unauthorized_user', userId, chatId: ctx.chat!.id });
      return;
    }

    const sessionKey = `tg:${ctx.chat!.id}`;
    const typingInterval = startTypingIndicator(ctx);

    agentLogger.info({ msg: 'tg_incoming', chatId: ctx.chat!.id, userId, input: input.substring(0, 200) });

    const sessionAdapter = new TelegramSessionAdapter(
      ctx, this.bot, this.config, this.pendingApprovals, this.pendingChoices,
    );
    const agent = new Agent(this.config, sessionAdapter);

    try {
      await sessionAdapter.sendThinking();
      const result: RunResult = await agent.run(input, { sessionKey });
      if (!result.tgSent && result.content) {
        await sessionAdapter.reply(result.content);
      }
    } catch (err) {
      const error = err as Error;
      agentLogger.error({ msg: 'tg_error', chatId: ctx.chat!.id, error: error.message });
      await ctx.reply(formatTgError(error), { link_preview_options: { is_disabled: true } });
    } finally {
      await sessionAdapter.cleanupStatus();
      clearInterval(typingInterval);
      cleanup?.();
    }
  }

  /**
   * Initialize bot handlers and start long-polling.
   *
   * Handler registration order matters:
   * 1. Commands (/start, /new, /kill, dynamic skill commands such as /init) — registered first for priority
   * 2. Text messages
   * 3. Voice messages (download → STT → agent)
   * 4. Photo messages (download → vision → agent)
   * 5. Callback queries (approval, choice, or generic keyboard callbacks)
   */
  async start(): Promise<void> {
    await registerAllTools();

    // ── Build command list from installed skills ──
    const skills = loadSkills();
    const botCommands: Array<{ command: string; description: string }> = [
      { command: 'new', description: '🔄 New conversation' },
      { command: 'kill', description: '💀 Force stop & clear' },
    ];

    // Map skill names to short command names — only for skills with command: true
    const skillCommandMap = new Map<string, string>();
    for (const skill of skills) {
      if (!skill.command) continue; // skip internal skills
      const cmd = skill.name.replace(/[^a-z0-9_]/g, '_').substring(0, 32);
      const desc = (skill.description || skill.name).substring(0, 256);
      botCommands.push({ command: cmd, description: desc });
      skillCommandMap.set(cmd, skill.name);
    }

    // Register commands with Telegram (shows menu when user types '/')
    await this.bot.api.setMyCommands(botCommands);

    // ── Bot commands ──

    this.bot.command('start', async (ctx) => {
      const name = this.config.agent.name;
      const cmdList = [...skillCommandMap.entries()]
        .map(([cmd]) => `/${cmd}`)
        .join('  ');

      await ctx.reply(
        `Hey! I'm ${name} 🌟\n\n` +
        `Just send me a message, or jump right in:\n\n` +
        `${cmdList}\n\n` +
        `/new start fresh  ·  /kill force stop`,
      );
    });

    this.bot.command('new', async (ctx) => {
      const sessionKey = `tg:${ctx.chat.id}`;
      this.cancelPending();
      await createSession(sessionKey);
      await ctx.reply('🔄 Fresh start! What\'s on your mind?');
      agentLogger.info({ msg: 'tg_new_session', chatId: ctx.chat.id });
    });

    this.bot.command('kill', async (ctx) => {
      const sessionKey = `tg:${ctx.chat.id}`;
      const cancelled = this.cancelPending();
      await createSession(sessionKey);
      const extra = cancelled > 0 ? ` Cancelled ${cancelled} pending task(s).` : '';
      await ctx.reply(`💀 Stopped.${extra}\nSession cleared — send a message to start over.`);
      agentLogger.info({ msg: 'tg_kill', chatId: ctx.chat.id, cancelled });
    });

    // Dynamic skill commands — route to agent as "Run skill: <name>"
    for (const [cmd, skillName] of skillCommandMap) {
      this.bot.command(cmd, async (ctx) => {
        agentLogger.info({ msg: 'tg_skill_command', chatId: ctx.chat.id, skill: skillName });
        const sessionKey = `tg:${ctx.chat.id}`;
        await createSession(sessionKey);
        const input = `[/command: ${skillName}] Run the "${skillName}" skill now.`;
        this.enqueuePerChat(ctx.chat.id, () => this.handleIncoming(ctx, input));
      });
    }

    // ── Message handler ──

    this.bot.on('message:text', async (ctx) => {
      const input = ctx.message.text;

      // ── Intercept approval reply keyboard responses ──
      if (this.tryResolveApproval(input)) {
        agentLogger.info({ msg: 'tg_approval_reply', chatId: ctx.chat.id, action: input });
        return;
      }

      agentLogger.info({ msg: 'tg_message', chatId: ctx.chat.id, userId: ctx.from?.id, text: input.substring(0, 100) });
      this.enqueuePerChat(ctx.chat.id, () => this.handleIncoming(ctx, input));
    });

    // ── Voice message handler (download → Groq Whisper STT → agent) ──

    this.bot.on('message:voice', async (ctx) => {
      agentLogger.info({ msg: 'tg_voice', chatId: ctx.chat.id, userId: ctx.from?.id, duration: ctx.message.voice.duration });

      // Step 1: Download the voice file from Telegram servers
      let audioPath: string;
      try {
        const file = await ctx.getFile();
        const fileUrl = `https://api.telegram.org/file/bot${this.config.telegram.bot_token}/${file.file_path}`;
        const response = await fetch(fileUrl);
        if (!response.ok) throw new Error(`Download failed: ${response.status}`);

        const buffer = Buffer.from(await response.arrayBuffer());
        audioPath = path.join(VOICE_DIR, `voice_${Date.now()}.ogg`);
        fs.mkdirSync(VOICE_DIR, { recursive: true });
        fs.writeFileSync(audioPath, buffer);
        agentLogger.info({ msg: 'tg_voice_cached', path: audioPath, bytes: buffer.length });
      } catch (err) {
        agentLogger.error({ msg: 'tg_voice_download_error', error: (err as Error).message });
        await ctx.reply('❌ Voice download failed, please try again.');
        return;
      }

      // Step 2: Transcribe via Groq Whisper SDK
      const sttResult = await transcribeAudio(audioPath, this.config);

      if (!sttResult.success || !sttResult.transcript) {
        const errMsg = sttResult.error || 'Could not recognize speech';
        agentLogger.warn({ msg: 'tg_stt_failed', error: errMsg });
        await ctx.reply(`🎤 ${errMsg}`);
        fs.unlink(audioPath, () => {});
        return;
      }

      // Step 3: Wrap transcript and feed into the agent
      // Include audio_path so tools (e.g. pron_assess) can reference the file
      const input = `[Voice message | audio_path: ${audioPath}]\n"${sttResult.transcript}"`;
      agentLogger.info({ msg: 'tg_voice_transcribed', chatId: ctx.chat.id, text: sttResult.transcript.substring(0, 100) });
      trackStt(ctx.message.voice.duration || 0);

      this.enqueuePerChat(ctx.chat.id, () => this.handleIncoming(ctx, input));
    });

    // ── Photo message handler (download → Gemini Vision → agent) ──

    this.bot.on('message:photo', async (ctx) => {
      const caption = ctx.message.caption || '';
      agentLogger.info({ msg: 'tg_photo', chatId: ctx.chat.id, userId: ctx.from?.id, caption: caption.substring(0, 100) });

      // Always pick the largest photo (last element in the photo array)
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      let imagePath = '';

      try {
        const file = await ctx.api.getFile(photo.file_id);
        if (!file.file_path) {
          await ctx.reply('❌ Failed to download image.');
          return;
        }

        const fileUrl = `https://api.telegram.org/file/bot${this.config.telegram.bot_token}/${file.file_path}`;
        const response = await fetch(fileUrl);
        if (!response.ok) {
          await ctx.reply('❌ Image download failed.');
          return;
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        const ext = path.extname(file.file_path) || '.jpg';
        imagePath = path.join(IMAGE_RECEIVED_DIR, `photo_${Date.now()}${ext}`);
        fs.writeFileSync(imagePath, buffer);
        agentLogger.info({ msg: 'tg_photo_cached', path: imagePath, bytes: buffer.length });
      } catch (err) {
        agentLogger.error({ msg: 'tg_photo_download_error', error: (err as Error).message });
        await ctx.reply('❌ Image download failed, please try again.');
        return;
      }

      // Analyze image via Gemini Vision SDK
      const visionResult = await analyzeImage(imagePath, this.config, caption || undefined);

      if (!visionResult.success || !visionResult.description) {
        const errMsg = visionResult.error || 'Could not analyze image';
        agentLogger.warn({ msg: 'tg_vision_failed', error: errMsg });
        await ctx.reply(`🖼️ ${errMsg}`);
        fs.unlink(imagePath, () => {});
        return;
      }

      // Build agent input with vision description injected as context
      const input = caption
        ? `[User sent a photo with caption: "${caption}"]\n[Vision analysis: ${visionResult.description}]`
        : `[User sent a photo]\n[Vision analysis: ${visionResult.description}]`;

      agentLogger.info({ msg: 'tg_vision_done', chatId: ctx.chat.id, descLength: visionResult.description.length });

      // Keep image for audit trail (don't delete)
      this.enqueuePerChat(ctx.chat.id, () => this.handleIncoming(ctx, input));
    });

    // ── Callback query dispatcher (approvals + choices + custom) ──
    this.bot.on('callback_query:data', async (ctx) => {
      const data = ctx.callbackQuery.data;

      // Always answer callback query FIRST to dismiss Telegram loading spinner
      await ctx.answerCallbackQuery().catch(() => {});

      if (data.startsWith('choice_')) {
        const sepIdx = data.indexOf(':');
        const choiceId = data.substring(0, sepIdx);
        const pending = this.pendingChoices.get(choiceId);
        if (pending) {
          this.pendingChoices.delete(choiceId);

          const inlineKeyboard = ctx.callbackQuery.message?.reply_markup?.inline_keyboard;
          let selectedText = '';
          if (inlineKeyboard) {
            for (const row of inlineKeyboard) {
              for (const btn of row) {
                if ('callback_data' in btn && btn.callback_data === data) {
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
      // ── Practice menu navigation (client-side, no agent) ──
      else if (isNavCallback(data)) {
        const page = getNavPage(data);
        if (page) {
          await ctx.editMessageText(page.text, {
            reply_markup: page.keyboard,
          }).catch(() => {});
        }
      }
      // ── Show main menu (from menu callback) ──
      else if (data === 'menu') {
        const menu = getMainMenu();
        if (menu) {
          await ctx.editMessageText(menu.text, {
            reply_markup: menu.keyboard,
          }).catch(() => {});
        }
      }
      // ── Generic callback (from tg_keyboard tool) ──
      // Route unmatched button clicks back into the Agent as a new user input.
      else {
        const userId = ctx.from?.id;
        const allowedUsers = this.config.telegram.allowed_user_ids;
        if (allowedUsers.length > 0 && userId && !allowedUsers.includes(userId)) {
          await ctx.answerCallbackQuery();
          return;
        }

        const inlineKeyboard = ctx.callbackQuery.message?.reply_markup?.inline_keyboard;
        let selectedLabel = data;
        if (inlineKeyboard) {
          for (const row of inlineKeyboard) {
            for (const btn of row) {
              if ('callback_data' in btn && btn.callback_data === data) {
                selectedLabel = btn.text;
              }
            }
          }
        }

        await ctx.editMessageText(
          ctx.callbackQuery.message?.text + `\n\n→ ${selectedLabel}`
        ).catch(() => {});

        const chatId = ctx.callbackQuery.message?.chat?.id;
        if (chatId) {
          const sessionKey = `tg:${chatId}`;
          const agentInput = `[callback] ${data}`;

          agentLogger.info({ msg: 'tg_callback', chatId, userId, data, label: selectedLabel });
          console.log(`[gateway] callback: ${selectedLabel} (${data})`);

          this.enqueuePerChat(chatId, async () => {
            const sessionAdapter = new TelegramSessionAdapter(ctx as any, this.bot, this.config, this.pendingApprovals, this.pendingChoices);
            const agent = new Agent(this.config, sessionAdapter);

            try {
              await sessionAdapter.sendThinking();
              const result: RunResult = await agent.run(agentInput, { sessionKey });
              if (!result.tgSent && result.content) {
                await sessionAdapter.reply(result.content);
              }
            } catch (err) {
              const error = err as Error;
              agentLogger.error({ msg: 'tg_callback_error', chatId, error: error.message });
              await this.bot.api.sendMessage(chatId, formatTgError(error), { link_preview_options: { is_disabled: true } }).catch(() => {});
            } finally {
              await sessionAdapter.cleanupStatus();
            }
          });
        }
      }
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

  /** Gracefully stop the bot's long-polling loop. */
  stop(): void {
    this.bot.stop();
  }
}
