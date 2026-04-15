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

  constructor(config: AnyaConfig) {
    if (!config.telegram.bot_token) {
      throw new Error('Telegram bot_token not configured. Run "anya init" or "anya config edit".');
    }

    this.config = config;
    this.bot = new Bot(config.telegram.bot_token);
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
      await ctx.reply('Unauthorized. Your user ID is not in the allowed list.');
      agentLogger.warn({ msg: 'unauthorized_user', userId, chatId: ctx.chat!.id });
      return;
    }

    const sessionKey = `tg:${ctx.chat!.id}`;
    const typingInterval = startTypingIndicator(ctx);

    const sessionAdapter = new TelegramSessionAdapter(
      ctx, this.bot, this.config, this.pendingApprovals, this.pendingChoices,
    );
    const agent = new Agent(this.config, sessionAdapter);

    try {
      const result: RunResult = await agent.run(input, { sessionKey });
      if (!result.tgSent && result.content) {
        await sessionAdapter.reply(result.content);
      }
    } catch (err) {
      const error = err as Error;
      agentLogger.error({ msg: 'tg_error', chatId: ctx.chat!.id, error: error.message });
      await ctx.reply(formatTgError(error), { link_preview_options: { is_disabled: true } });
    } finally {
      clearInterval(typingInterval);
      cleanup?.();
    }
  }

  /**
   * Initialize bot handlers and start long-polling.
   *
   * Handler registration order matters:
   * 1. Commands (/start, /new) — registered first for priority
   * 2. Text messages
   * 3. Voice messages (download → STT → agent)
   * 4. Photo messages (download → vision → agent)
   * 5. Callback queries (approval, choice, or generic keyboard callbacks)
   */
  async start(): Promise<void> {
    await registerAllTools();

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
      const input = ctx.message.text;
      agentLogger.info({ msg: 'tg_message', chatId: ctx.chat.id, userId: ctx.from?.id, text: input.substring(0, 100) });
      await this.handleIncoming(ctx, input);
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
        await ctx.reply('❌ 语音下载失败，请重试。');
        return;
      }

      // Step 2: Transcribe via Groq Whisper SDK
      const sttResult = await transcribeAudio(audioPath, this.config);

      if (!sttResult.success || !sttResult.transcript) {
        const errMsg = sttResult.error || '无法识别语音内容';
        agentLogger.warn({ msg: 'tg_stt_failed', error: errMsg });
        await ctx.reply(`🎤 ${errMsg}`);
        fs.unlink(audioPath, () => {});
        return;
      }

      // Step 3: Wrap transcript and feed into the agent
      // Include audio_path so tools (e.g. pron_assess) can reference the file
      const input = `[语音消息 | audio_path: ${audioPath}]\n"${sttResult.transcript}"`;
      agentLogger.info({ msg: 'tg_voice_transcribed', chatId: ctx.chat.id, text: sttResult.transcript.substring(0, 100) });

      await this.handleIncoming(ctx, input);
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
          await ctx.reply('❌ 无法获取图片文件。');
          return;
        }

        const fileUrl = `https://api.telegram.org/file/bot${this.config.telegram.bot_token}/${file.file_path}`;
        const response = await fetch(fileUrl);
        if (!response.ok) {
          await ctx.reply('❌ 图片下载失败。');
          return;
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        const ext = path.extname(file.file_path) || '.jpg';
        imagePath = path.join(IMAGE_RECEIVED_DIR, `photo_${Date.now()}${ext}`);
        fs.writeFileSync(imagePath, buffer);
        agentLogger.info({ msg: 'tg_photo_cached', path: imagePath, bytes: buffer.length });
      } catch (err) {
        agentLogger.error({ msg: 'tg_photo_download_error', error: (err as Error).message });
        await ctx.reply('❌ 图片下载失败，请重试。');
        return;
      }

      // Analyze image via Gemini Vision SDK
      const visionResult = await analyzeImage(imagePath, this.config, caption || undefined);

      if (!visionResult.success || !visionResult.description) {
        const errMsg = visionResult.error || '无法分析图片内容';
        agentLogger.warn({ msg: 'tg_vision_failed', error: errMsg });
        await ctx.reply(`🖼️ ${errMsg}`);
        fs.unlink(imagePath, () => {});
        return;
      }

      // Build agent input with vision description injected as context
      const input = caption
        ? `[用户发送了一张图片，附带说明: "${caption}"]\n[图片分析: ${visionResult.description}]`
        : `[用户发送了一张图片]\n[图片分析: ${visionResult.description}]`;

      agentLogger.info({ msg: 'tg_vision_done', chatId: ctx.chat.id, descLength: visionResult.description.length });

      await this.handleIncoming(ctx, input, () => fs.unlink(imagePath, () => {}));
    });

    // ── Callback query dispatcher (approvals + choices + custom) ──
    this.bot.on('callback_query:data', async (ctx) => {
      const data = ctx.callbackQuery.data;

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
      else if (data.startsWith('choice_')) {
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
              if (btn.callback_data === data) {
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

          const sessionAdapter = new TelegramSessionAdapter(ctx as any, this.bot, this.config, this.pendingApprovals, this.pendingChoices);
          const agent = new Agent(this.config, sessionAdapter);

          try {
            const result: RunResult = await agent.run(agentInput, { sessionKey });
            if (!result.tgSent && result.content) {
              await sessionAdapter.reply(result.content);
            }
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

  /** Gracefully stop the bot's long-polling loop. */
  stop(): void {
    this.bot.stop();
  }
}
