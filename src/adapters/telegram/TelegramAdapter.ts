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
import { VOICE_DIR, IMAGE_RECEIVED_DIR, USER_MD_PATH } from '../../lib/paths.js';
import type { AnyaConfig } from '../../config/defaults.js';
import type { MessageFile } from '../../agent/types.js';
import fs from 'node:fs';
import path from 'node:path';

import { TelegramSessionAdapter } from './SessionAdapter.js';
import type { PendingApproval, PendingChoice } from './types.js';
import { formatTgError, startTypingIndicator } from './errors.js';
import { isNavCallback, getNavPage, getMainMenu } from './skillMenu.js';

/** Fetch with retry + timeout for Telegram file downloads. */
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
  /**
   * Tracks active quiz/polls so we can correlate poll_answer events.
   * Key = poll_id, Value = { chatId, options, correctIndex }.
   * Entries auto-expire after 24h to prevent memory leaks.
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
   * Cancel all pending approvals and choices.
   * Resolves approvals as 'deny', choices as empty string.
   * @returns number of cancelled items.
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
   * 4. Photo messages (download → agent natively)
   * 5. Callback queries (approval, choice, or generic keyboard callbacks)
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
        `/new start practice  ·  /kill force stop`,
      );
    });

    this.bot.command('new', async (ctx) => {
      const sessionKey = `tg:${ctx.chat.id}`;
      this.cancelPending();
      await createSession(sessionKey);
      agentLogger.info({ msg: 'tg_new_session_trigger_practice', chatId: ctx.chat.id });
      const input = `[/command: ielts-router] Run the "ielts-router" skill now.`;
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
      
      const text = `📊 <b>Anya Usage — ${usage.month}</b>\n\n` +
        `🧠 <b>LLM (ChatGPT)</b>\n` +
        `├ Calls: <code>${fmtNum(usage.llm.calls)}</code>\n` +
        `├ Input: <code>${fmtNum(usage.llm.input_tokens)}</code>\n` +
        `└ Output: <code>${fmtNum(usage.llm.output_tokens)}</code>\n\n` +
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
        `🔍 <b>Web:</b> <code>${fmtNum(usage.web_search.calls)}</code> | 👀 <b>Vision:</b> <code>${fmtNum(usage.vision.calls)}</code>`;

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

      agentLogger.info({ msg: 'tg_restart_command', chatId: ctx.chat.id, userId });
      await ctx.reply('🔄 Restarting gateway...');

      // Spawn a detached process to restart after this process exits.
      // Uses the same entry point: `anya gateway start`
      const { spawn } = await import('node:child_process');
      const { openSync } = await import('node:fs');
      const { LOGS_DIR } = await import('../../lib/paths.js');
      const logFd = openSync(path.join(LOGS_DIR, 'gateway.log'), 'a');

      const anyaBin = process.argv[1];
      const child = spawn(process.execPath, [anyaBin, 'gateway', 'start', '--foreground'], {
        detached: true,
        stdio: ['ignore', logFd, logFd],
        env: { ...process.env },
      });
      child.unref();

      agentLogger.info({ msg: 'tg_restart_spawned', newPid: child.pid });

      // Give the reply time to send, then exit this process
      setTimeout(() => {
        process.exit(0);
      }, 500);
    });

    // ── Command aliases: short Telegram commands → existing skills ──
    // No separate SKILL.md needed — just a mapping table.
    const commandAliases: Array<{ cmd: string; description: string; skill: string }> = [
      { cmd: 'init',     description: '🎯 Initialize study profile', skill: 'profile-manager' },
    ];

    for (const alias of commandAliases) {
      // Remove from skillCommandMap if the target skill has command: true
      // to avoid duplicate registration
      for (const [existingCmd, existingSkill] of skillCommandMap) {
        if (existingSkill === alias.skill) {
          skillCommandMap.delete(existingCmd);
          break;
        }
      }
      botCommands.push({ command: alias.cmd, description: alias.description });
    }

    // Append restart and kill last so they appear at the bottom of the menu
    botCommands.push(
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
            const sessionAdapter = new TelegramSessionAdapter(ctx as any, this.bot, this.config, this.pendingApprovals, this.pendingChoices, this.activePolls);
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
