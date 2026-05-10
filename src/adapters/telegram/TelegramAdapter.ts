/**
 * @module adapters/telegram/TelegramAdapter
 * @description Top-level Telegram bot manager and lifecycle controller.
 *
 * Owns the Grammy {@link Bot} instance and orchestrates long-polling. It registers
 * global commands and event handlers, routing incoming messages, voice notes, photos,
 * and callbacks. For each incoming turn, it spawns a transient {@link TelegramSessionAdapter}.
 *
 * ## Callback Routing Architecture
 * Callback queries are routed across three tiers:
 *   1. `approval_*`: Resolves a pending `requestApproval()` promise.
 *   2. `choice_*`: Resolves a pending `requestChoice()` promise.
 *   3. Other: Fed into `Agent.run()` as a new turn via the `[callback] <data>` format.
 */

import { Bot, type Context } from 'grammy';
import { Agent, type RunResult } from '../../agent/Agent.js';
import { registerAllTools } from '../../tools/registry.js';
import { agentLogger } from '../../lib/logger.js';
import { trackStt } from '../../lib/usage.js';
import { loadSkills, getSkill } from '../../skills/loader.js';
import { createSession, setActiveSkill } from '../../storage/sessionStore.js';
import { transcribeAudio } from '../../lib/stt.js';
import { VOICE_DIR, IMAGE_RECEIVED_DIR, USER_MD_PATH } from '../../lib/paths.js';
import type { AnyaConfig } from '../../config/defaults.js';
import type { MessageFile } from '../../agent/types.js';
import fs from 'node:fs';
import path from 'node:path';

import { TelegramSessionAdapter } from './SessionAdapter.js';
import type { PendingApproval, PendingChoice } from './types.js';
import { formatTgError, startTypingIndicator } from './errors.js';
import { isNavCallback, getNavPage, getMainMenu } from './skillMenu.js';
import { startScheduler, stopScheduler } from '../../lib/scheduler.js';
import { markdownToTelegramHtml } from '../../lib/tgFormat.js';

/**
 * Fetches a URL with exponential backoff retry and a timeout.
 * Used primarily for downloading user-sent files (audio, images) from Telegram.
 *
 * @param url - The target URL to fetch.
 * @param maxAttempts - Maximum number of fetch attempts.
 * @param timeoutMs - Timeout per attempt in milliseconds.
 * @returns A Promise resolving to the successful Response object.
 * @throws If all attempts fail.
 */
async function fetchWithRetry(url: string, maxAttempts = 3, timeoutMs = 15_000): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) return res;
      agentLogger.warn({ msg: 'fetch_retry', attempt, status: res.status, url: url.substring(0, 60) });
    } catch (err) {
      lastError = err as Error;
      agentLogger.warn({ msg: 'fetch_retry', attempt, error: (err as Error).message });
    }
    if (attempt < maxAttempts) await new Promise(r => setTimeout(r, 1000 * attempt));
  }
  throw lastError ?? new Error(`Download failed after ${maxAttempts} attempts`);
}

/**
 * `TelegramAdapter` is the top-level singleton manager for the Telegram bot.
 *
 * It encapsulates the Grammy Bot instance, registers command and event handlers,
 * manages the serial processing queue per chat, and coordinates the long-polling lifecycle.
 * It spawns a fresh `TelegramSessionAdapter` for each conversation turn.
 */
export class TelegramAdapter {
  private bot: Bot;
  private config: AnyaConfig;
  /** Pending approval dialogs, keyed by approval ID. Resolved by callback_query handler. */
  private pendingApprovals = new Map<string, PendingApproval>();
  /** Pending choice dialogs, keyed by choice ID. Resolved by callback_query handler. */
  private pendingChoices = new Map<string, PendingChoice>();
  /**
   * Per-chat serial execution queue.
   * Guarantees that multiple concurrent messages in the same chat are processed sequentially
   * to avoid race conditions on the shared chat history (`tg:<chatId>`) and status messages.
   */
  private chatQueue = new Map<number, Promise<void>>();
  /**
   * Tracks active Telegram quizzes/polls to correlate delayed `poll_answer` events.
   * Keys are `poll_id`, Values map to chat context and correct answer data.
   */
  activePolls = new Map<string, { chatId: number; options: string[]; correctIndex: number }>();

  constructor(config: AnyaConfig) {
    if (!config.telegram.bot_token) {
      throw new Error('Telegram bot_token not configured. Run "anya init" or "anya config edit".');
    }

    this.config = config;
    this.bot = new Bot(config.telegram.bot_token);
  }

  /**
   * Cancels all pending user dialogs (approvals and choices).
   * Approvals are forcibly resolved to 'deny', and choices to an empty string.
   *
   * @returns The number of cancelled dialogs.
   */
  private cancelPending(): number {
    let count = 0;
    for (const [, pending] of this.pendingApprovals) {
      pending.resolve('deny');
      count++;
    }
    this.pendingApprovals.clear();
    for (const [, pending] of this.pendingChoices) {
      pending.resolve('');
      count++;
    }
    this.pendingChoices.clear();
    return count;
  }


  /**
   * Appends an async task onto the serial execution queue for a specific chat.
   * Execution happens sequentially; errors are caught and logged without breaking the queue.
   *
   * @param chatId - The Telegram chat ID.
   * @param task - The async function to execute.
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
   * Dispatches a proactive message to a chat outside of the normal user-triggered request/reply flow.
   * Commonly used for Cron jobs or delayed system alerts.
   *
   * @param chatId - The destination chat ID.
   * @param text - The Markdown formatted text to send.
   */
  async sendProactiveMessage(chatId: number, text: string): Promise<void> {
    await this.bot.api.sendMessage(chatId, markdownToTelegramHtml(text), {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    }).catch(() => this.bot.api.sendMessage(chatId, text, {
      link_preview_options: { is_disabled: true },
    }));
  }

  /**
   * Core message-handling pipeline utilized by text, voice, and photo events.
   * Orchestrates authorization, typing indicators, adapter instantiation, agent invocation,
   * error handling, and cleanup.
   *
   * @param ctx - The Grammy context for the incoming event.
   * @param input - The extracted text or augmented prompt derived from the event.
   * @param cleanup - An optional callback fired after processing (e.g., deleting temporary files).
   * @param files - Optional array of file attachments passed to the Agent.
   */
  private async handleIncoming(
    ctx: Context,
    input: string,
    cleanup?: () => void,
    files?: MessageFile[],
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

    // Auto-detect uninitialized user and hint the LLM to run onboarding
    if (!input.includes('/command: profile-manager')) {
      try {
        const userMd = fs.existsSync(USER_MD_PATH) ? fs.readFileSync(USER_MD_PATH, 'utf-8') : '';
        if (!userMd || userMd.includes('initialized: false')) {
          input = `[SYSTEM: The user has not completed onboarding yet (initialized=false). Run the "profile-manager" skill to collect their profile before doing anything else.]\n\n${input}`;
        }
      } catch { /* ignore read errors */ }
    }

    agentLogger.info({ msg: 'tg_incoming', chatId: ctx.chat!.id, userId, input: input.substring(0, 200) });

    const sessionAdapter = new TelegramSessionAdapter(
      ctx, this.bot, this.config, this.pendingApprovals, this.pendingChoices, this.activePolls,
    );
    const agent = new Agent(this.config, sessionAdapter);

    try {
      await sessionAdapter.sendThinking();
      const result: RunResult = await agent.run(input, { sessionKey, files });
      if (!result.tgSent && result.content) {
        // Warn if the agent used tools during the run but ended without sending
        // via tg_msg — likely the LLM forgot to call tg_msg for its final reply,
        // which causes the user to miss the response (the "口语扫描器卡了" pattern).
        if (result.toolCallCount > 0) {
          agentLogger.warn({
            msg: 'tg_bare_text_fallback',
            chatId: ctx.chat!.id,
            toolCallCount: result.toolCallCount,
            contentLen: result.content.length,
          });
        }
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
   * Initializes bot handlers and initiates the long-polling loop.
   *
   * Command registration order is strict:
   * 1. Global system commands (`/start`, `/kill`) and dynamic skill aliases.
   * 2. Text message handler.
   * 3. Voice note handler (incorporating STT).
   * 4. Photo handler (incorporating Vision API).
   * 5. Callback query dispatcher.
   */
  async start(): Promise<void> {
    await registerAllTools();

    // ── Build command list from installed skills ──
    const skills = loadSkills();
    const botCommands: Array<{ command: string; description: string }> = [
      { command: 'new', description: '🔄 New practice session' },
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

    // ── Command aliases: short Telegram commands → existing skills ──
    // No separate SKILL.md needed — just a mapping table.
    const commandAliases: Array<{ cmd: string; description: string; skill: string }> = [
      { cmd: 'init',     description: '🎯 Initialize study profile', skill: 'profile-manager' },
    ];

    // ── Bot commands ──

    this.bot.command('start', async (ctx) => {
      const name = 'Anya';
      const cmdList = [
        ...[...skillCommandMap.keys()].map((cmd) => `/${cmd}`),
        ...commandAliases.map((alias) => `/${alias.cmd}`),
      ]
        .filter((cmd, idx, arr) => arr.indexOf(cmd) === idx)
        .join('  ');

      await ctx.reply(
        `Hey! I'm ${name} 🌟\n\n` +
        `Just send me a message, or jump right in:\n\n` +
        `${cmdList}\n\n` +
        `/new open menu  ·  /kill force stop`,
      );
    });

    this.bot.command('new', async (ctx) => {
      const sessionKey = `tg:${ctx.chat.id}`;
      this.cancelPending();
      await createSession(sessionKey);
      agentLogger.info({ msg: 'tg_new_session_trigger_planner', chatId: ctx.chat.id });
      const input = `[/command: planner] Run the "planner" skill now.`;
      this.enqueuePerChat(ctx.chat.id, () => this.handleIncoming(ctx, input));
    });

    this.bot.command('kill', async (ctx) => {
      const sessionKey = `tg:${ctx.chat.id}`;
      const cancelled = this.cancelPending();
      await createSession(sessionKey);
      const extra = cancelled > 0 ? ` Cancelled ${cancelled} pending task(s).` : '';
      await ctx.reply(`💀 Stopped.${extra}\nSession cleared — send a message to start over.`);
      agentLogger.info({ msg: 'tg_kill', chatId: ctx.chat.id, cancelled });
    });
    this.bot.command('model', async (ctx) => {
      const current = this.config.provider.backend;
      const currentModel = this.config.provider.model;

      const buttons = [
        [
          {
            text: `${current === 'gemini' ? '✅ ' : ''}Gemini`,
            callback_data: 'model:gemini',
          },
          {
            text: `${current === 'codex' ? '✅ ' : ''}Codex (ChatGPT)`,
            callback_data: 'model:codex',
          },
        ],
      ];

      await ctx.reply(
        `🤖 <b>Model Settings</b>\n\n` +
        `├ Backend: <code>${current}</code>\n` +
        `└ Model: <code>${currentModel}</code>\n\n` +
        `Select a provider:`,
        {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: buttons },
        },
      );
      agentLogger.info({ msg: 'tg_model_command', chatId: ctx.chat.id });
    });

    this.bot.command('usage', async (ctx) => {
      const { loadUsage } = await import('../../lib/usage.js');
      const usage = loadUsage();
      const fmtNum = (n: number) => n.toLocaleString();
      const fmtDuration = (sec: number) => {
        if (sec < 60) return `${Math.round(sec)}s`;
        if (sec < 3600) return `${Math.floor(sec / 60)}m ${Math.round(sec % 60)}s`;
        return `${Math.floor(sec / 3600)}h ${Math.round((sec % 3600) / 60)}m`;
      };
      
      const AZURE_FREE_CHARS = 500_000;
      const AZURE_FREE_SPEECH_HOURS = 5;
      
      // Build per-provider LLM breakdown
      const cacheHitPct = usage.llm.input_tokens > 0
        ? Math.round((usage.llm.cached_tokens / usage.llm.input_tokens) * 100)
        : 0;
      let llmSection = `🧠 <b>LLM</b> (${this.config.provider.backend})\n` +
        `├ Calls: <code>${fmtNum(usage.llm.calls)}</code>\n` +
        `├ Input: <code>${fmtNum(usage.llm.input_tokens)}</code>\n` +
        `├ Output: <code>${fmtNum(usage.llm.output_tokens)}</code>\n` +
        `└ Cached: <code>${fmtNum(usage.llm.cached_tokens)}</code> (${cacheHitPct}% hit)`;

      const providers = Object.entries(usage.llm_by_provider);
      if (providers.length > 1) {
        llmSection += '\n';
        for (const [name, stats] of providers) {
          llmSection += `\n  📌 <i>${name}</i>: ${fmtNum(stats.calls)} calls, ${fmtNum(stats.input_tokens)}/${fmtNum(stats.output_tokens)} tok`;
        }
      }
      
      const text = `📊 <b>Anya Usage — ${usage.month}</b>\n\n` +
        llmSection + `\n\n` +
        `📢 <b>TTS (Azure)</b>\n` +
        `├ Calls: <code>${fmtNum(usage.tts.calls)}</code>\n` +
        `├ Chars: <code>${fmtNum(usage.tts.chars)}</code> / ${fmtNum(AZURE_FREE_CHARS)}\n` +
        `└ Dur: <code>${fmtDuration(usage.tts.duration_sec)}</code>\n\n` +
        `🗣️ <b>Pronunciation (Azure)</b>\n` +
        `├ Calls: <code>${fmtNum(usage.pron_assess.calls)}</code>\n` +
        `└ Dur: <code>${fmtDuration(usage.pron_assess.duration_sec)}</code> / ${AZURE_FREE_SPEECH_HOURS}h\n\n` +
        `🎤 <b>STT (Groq Whisper)</b>\n` +
        `├ Calls: <code>${fmtNum(usage.stt.calls)}</code>\n` +
        `└ Dur: <code>${fmtDuration(usage.stt.duration_sec)}</code>\n\n` +
        `🔍 <b>Web Search</b>\n` +
        `└ Calls: <code>${fmtNum(usage.web_search.calls)}</code>\n\n` +
        `👀 <b>Vision</b>\n` +
        `└ Calls: <code>${fmtNum(usage.vision.calls)}</code>`;

      await ctx.reply(text, { parse_mode: 'HTML' });
      agentLogger.info({ msg: 'tg_usage_command', chatId: ctx.chat.id });
    });

    this.bot.command('restart', async (ctx) => {
      const userId = ctx.from?.id;
      const allowedUsers = this.config.telegram.allowed_user_ids;
      if (allowedUsers.length > 0 && userId && !allowedUsers.includes(userId)) {
        await ctx.reply('⛔ Unauthorized.');
        return;
      }

      const updateId = ctx.update.update_id;
      agentLogger.info({ msg: 'tg_restart_command', chatId: ctx.chat.id, userId, updateId });
      const statusMsg = await ctx.reply('🔄 Restarting gateway...');

      // CRITICAL: stop polling and explicitly ACK this /restart update past
      // Telegram's queue BEFORE we exit. Otherwise the new child will re-read
      // the same /restart update on its first getUpdates call (offset never
      // advanced because we exited before grammy's next poll) and we loop
      // forever. bot.stop() halts the in-flight long-poll so the explicit
      // getUpdates call below doesn't 409 against ourselves.
      try {
        await this.bot.stop();
        await this.bot.api.getUpdates({ offset: updateId + 1, limit: 1, timeout: 0 });
      } catch (err) {
        agentLogger.error({ msg: 'tg_restart_ack_failed', error: (err as Error).message });
      }

      // Clean up PID file so the new process doesn't detect "already running"
      const { removePid } = await import('../../lib/pidfile.js');
      removePid('gateway');

      // Spawn a detached child process using the same entry point
      const { spawn } = await import('node:child_process');
      const { openSync } = await import('node:fs');
      const { LOGS_DIR } = await import('../../lib/paths.js');
      const logFd = openSync(path.join(LOGS_DIR, 'gateway.log'), 'a');

      const anyaBin = process.argv[1];
      const isTsx = process.argv[0].includes('tsx') || anyaBin.endsWith('.ts');
      const execPath = isTsx ? 'npx' : process.execPath;
      const execArgs = isTsx
        ? ['tsx', anyaBin, 'gateway', 'start', '--_bg_child']
        : [anyaBin, 'gateway', 'start', '--_bg_child'];

      const child = spawn(execPath, execArgs, {
        detached: true,
        stdio: ['ignore', logFd, logFd],
        env: { ...process.env },
      });
      child.unref();

      agentLogger.info({ msg: 'tg_restart_spawned', newPid: child.pid, updateId });

      // Edit the status message to confirm restart (best-effort), then exit
      try {
        await this.bot.api.editMessageText(
          ctx.chat.id,
          statusMsg.message_id,
          `✅ Gateway restarted (PID ${child.pid}).`,
        );
      } catch { /* best effort */ }

      process.exit(0);
    });

    for (const alias of commandAliases) {
      // Remove from skillCommandMap if the target skill has command: true
      // and the alias command is the same command, to avoid duplicate registration.
      for (const [existingCmd, existingSkill] of skillCommandMap) {
        if (existingSkill === alias.skill && existingCmd === alias.cmd) {
          skillCommandMap.delete(existingCmd);
          break;
        }
      }
      botCommands.push({ command: alias.cmd, description: alias.description });
    }

    // Append system commands last so they appear at the bottom of the menu
    botCommands.push(
      { command: 'model', description: '🤖 Switch LLM provider' },
      { command: 'usage', description: '📊 Check API usage' },
      { command: 'restart', description: '♻️ Restart gateway' },
      { command: 'kill', description: '💀 Force stop & clear' },
    );

    // Register commands with Telegram (shows menu when user types '/')
    await this.bot.api.setMyCommands(botCommands);

    // Register alias handlers
    for (const alias of commandAliases) {
      this.bot.command(alias.cmd, async (ctx) => {
        agentLogger.info({ msg: 'tg_alias_command', chatId: ctx.chat.id, cmd: alias.cmd, skill: alias.skill });
        const sessionKey = `tg:${ctx.chat.id}`;
        await createSession(sessionKey);
        const input = `[/command: ${alias.skill}] Run the "${alias.skill}" skill now.`;
        this.enqueuePerChat(ctx.chat.id, () => this.handleIncoming(ctx, input));
      });
    }

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
        const response = await fetchWithRetry(fileUrl);
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

    // ── Photo message handler (download → pass natively to agent) ──

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
        const response = await fetchWithRetry(fileUrl);

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

      // Determine MIME type from extension
      const ext = path.extname(imagePath).toLowerCase();
      const mimeMap: Record<string, string> = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.png': 'image/png', '.gif': 'image/gif',
        '.webp': 'image/webp', '.bmp': 'image/bmp',
      };
      const mimeType = mimeMap[ext] || 'image/jpeg';

      // Dual-model architecture: Analyze image via Gemini Vision SDK, then pass text to Codex/OpenAI
      const { analyzeImage } = await import('../../lib/vision.js');
      const visionResult = await analyzeImage(imagePath, this.config, caption || undefined);

      if (!visionResult.success || !visionResult.description) {
        const errMsg = visionResult.error || 'Could not analyze image';
        agentLogger.warn({ msg: 'tg_vision_failed', error: errMsg });
        await ctx.reply(`🖼️ ${errMsg}`);
        return;
      }

      const input = caption
        ? `[User sent a photo with caption: "${caption}"]\n[Vision analysis: ${visionResult.description}]`
        : `[User sent a photo]\n[Vision analysis: ${visionResult.description}]`;

      agentLogger.info({ msg: 'tg_vision_done', chatId: ctx.chat.id, descLength: visionResult.description.length });

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
      // If the source message is itself a menu page (every button is nav:* / menu / a known
      // skill slug), edit it in-place so navigation feels like a single drill-down screen.
      // Otherwise (source is a practice report with practice-action buttons like dict_next),
      // send as a NEW message so the original report stays in chat history.
      else if (isNavCallback(data)) {
        const page = getNavPage(data);
        if (page) {
          const chatId = ctx.callbackQuery.message?.chat?.id;
          if (chatId) {
            const sourceKeyboard = ctx.callbackQuery.message?.reply_markup?.inline_keyboard;
            const sourceIsMenu = !!sourceKeyboard && sourceKeyboard.every((row) =>
              row.every((btn) => {
                if (!('callback_data' in btn) || !btn.callback_data) return false;
                const cd = btn.callback_data;
                if (cd === 'menu' || cd.startsWith('nav:')) return true;
                if (!/[_:]/.test(cd) && getSkill(cd)) return true; // skill slug like "listening-dictation"
                return false;
              }),
            );
            agentLogger.info({ msg: 'tg_nav', chatId, data, mode: sourceIsMenu ? 'edit' : 'new' });
            try {
              if (sourceIsMenu) {
                await ctx.editMessageText(page.text, { reply_markup: page.keyboard });
              } else {
                await this.bot.api.sendMessage(chatId, page.text, { reply_markup: page.keyboard });
              }
            } catch (err) {
              agentLogger.error({ msg: 'tg_nav_render_failed', chatId, data, error: (err as Error).message });
            }
          }
        } else {
          agentLogger.warn({ msg: 'tg_nav_unknown_page', data });
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
      // ── Model switch (from /model inline keyboard) ──
      else if (data.startsWith('model:')) {
        const backend = data.replace('model:', '') as 'gemini' | 'codex';
        const MODELS: Record<string, string> = {
          gemini: 'gemini-3-flash-preview',
          codex: 'gpt-5.4',
        };
        this.config.provider.backend = backend;
        this.config.provider.model = MODELS[backend] || this.config.provider.model;

        const { persistConfig } = await import('../../config/loader.js');
        persistConfig(this.config);

        await ctx.editMessageText(
          `🤖 <b>Model Updated</b>\n\n` +
          `├ Backend: <code>${backend}</code>\n` +
          `└ Model: <code>${this.config.provider.model}</code>\n\n` +
          `✅ Changes saved. New conversations will use ${backend}.`,
          { parse_mode: 'HTML' },
        ).catch(() => {});

        agentLogger.info({ msg: 'model_switch', backend, model: this.config.provider.model });
      }
      // ── Generic callback (from tg_msg keyboard) ──
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

        // Detect skill slug callbacks early so we can skip editing the original message
        const matchedSkill = getSkill(data);
        const isSkillSwitch = !!matchedSkill;

        // For skill-switch callbacks, don't edit the original message — it may contain
        // menu content or evaluation results that should be preserved.
        if (!isSkillSwitch) {
          await ctx.editMessageText(
            ctx.callbackQuery.message?.text + `\n\n→ ${selectedLabel}`
          ).catch(() => {});
        }

        const chatId = ctx.callbackQuery.message?.chat?.id;
        if (chatId) {
          const sessionKey = `tg:${chatId}`;
          const agentInput = `[callback] ${data}`;

          agentLogger.info({ msg: 'tg_callback', chatId, userId, data, label: selectedLabel, skillSwitch: isSkillSwitch });
          console.log(`[gateway] callback: ${selectedLabel} (${data})${isSkillSwitch ? ' [skill-switch]' : ''}`);

          this.enqueuePerChat(chatId, async () => {
            const sessionAdapter = new TelegramSessionAdapter(ctx as any, this.bot, this.config, this.pendingApprovals, this.pendingChoices, this.activePolls);
            const agent = new Agent(this.config, sessionAdapter);

            try {
              await sessionAdapter.sendThinking();
              const runOpts: Record<string, unknown> = { sessionKey };

              // Skill switch → new session so old history is truly shed
              if (isSkillSwitch) {
                const newSid = await createSession(sessionKey);
                await setActiveSkill(newSid, data);
                runOpts.sessionId = newSid;
              }

              const result: RunResult = await agent.run(agentInput, runOpts as any);
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

    // ── Poll answer handler (quiz feedback) ──

    this.bot.on('poll_answer', async (ctx) => {
      const answer = ctx.pollAnswer;
      const pollId = answer.poll_id;
      const poll = this.activePolls.get(pollId);
      if (!poll) return; // Unknown poll (expired or not tracked)

      const userId = answer.user?.id;
      const allowedUsers = this.config.telegram.allowed_user_ids;
      if (allowedUsers.length > 0 && userId && !allowedUsers.includes(userId)) return;

      const selectedIdx = answer.option_ids?.[0];
      if (selectedIdx === undefined) return; // User retracted answer

      const selectedOption = poll.options[selectedIdx] || `Option ${selectedIdx}`;
      const isCorrect = selectedIdx === poll.correctIndex;
      const correctOption = poll.options[poll.correctIndex] || `Option ${poll.correctIndex}`;

      const input = isCorrect
        ? `[Quiz answer] User answered: "${selectedOption}" ✅ Correct`
        : `[Quiz answer] User answered: "${selectedOption}" ❌ Wrong (correct: "${correctOption}")`;

      agentLogger.info({ msg: 'tg_poll_answer', chatId: poll.chatId, userId, pollId, selectedIdx, isCorrect });

      this.enqueuePerChat(poll.chatId, async () => {
        // Create a minimal context-like object — poll_answer has no message context,
        // so we send directly via bot.api
        const sessionKey = `tg:${poll.chatId}`;
        const sessionAdapter = new TelegramSessionAdapter(
          ctx as any, this.bot, this.config, this.pendingApprovals, this.pendingChoices, this.activePolls,
        );
        // Override chatId since poll_answer ctx doesn't have ctx.chat
        sessionAdapter.setChatIdOverride(poll.chatId);
        const agent = new Agent(this.config, sessionAdapter);

        try {
          const result: RunResult = await agent.run(input, { sessionKey });
          if (!result.tgSent && result.content) {
            await sessionAdapter.reply(result.content);
          }
        } catch (err) {
          agentLogger.error({ msg: 'tg_poll_answer_error', chatId: poll.chatId, error: (err as Error).message });
        }
      });

      // Clean up after processing
      this.activePolls.delete(pollId);
    });

    agentLogger.info({ msg: 'tg_bot_starting' });
    console.log('[gateway] Telegram bot starting...');

    if (this.config.cron?.enabled) {
      startScheduler(this.config, {
        sendProactiveMessage: (chatId, text) => this.sendProactiveMessage(chatId, text),
      });
    }

    await this.bot.start({
      onStart: (info) => {
        console.log(`[gateway] Bot @${info.username} is running`);
        agentLogger.info({ msg: 'tg_bot_started', username: info.username });
      },
    });
  }

  /**
   * Gracefully terminates the Telegram bot's long-polling loop and halts scheduled jobs.
   */
  stop(): void {
    stopScheduler();
    this.bot.stop();
  }
}
