// adapters/telegram/TelegramAdapter.ts — Telegram bot gateway and router

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

export class TelegramAdapter {
  private bot: Bot;
  private config: AnyaConfig;
  private pendingApprovals = new Map<string, PendingApproval>();
  private pendingChoices = new Map<string, PendingChoice>();
  // Per-chat serial queue — prevents races on shared chat history (`tg:<chatId>`) and status messages
  private chatQueue = new Map<number, Promise<void>>();
  // Tracks active quizzes/polls to correlate delayed `poll_answer` events (keyed by poll_id)
  activePolls = new Map<string, { chatId: number; options: string[]; correctIndex: number }>();
  // Paginated message store: keyed by message_id; `page:<msgId>:<n>` callbacks flip pages without an LLM call
  paginatedMessages = new Map<number, { pages: string[]; buttons: string; chatId: number }>();

  constructor(config: AnyaConfig) {
    if (!config.telegram.bot_token) {
      throw new Error('Telegram bot_token not configured. Run "anya init" or "anya config edit".');
    }

    this.config = config;
    this.bot = new Bot(config.telegram.bot_token);
  }

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

  async sendProactiveMessage(chatId: number, text: string): Promise<void> {
    await this.bot.api.sendMessage(chatId, markdownToTelegramHtml(text), {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    }).catch(() => this.bot.api.sendMessage(chatId, text, {
      link_preview_options: { is_disabled: true },
    }));
  }

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

    // Hint the LLM to run onboarding when user.md is missing or marked uninitialized
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
      ctx, this.bot, this.config, this.pendingApprovals, this.pendingChoices, this.activePolls, this.paginatedMessages,
    );
    const agent = new Agent(this.config, sessionAdapter);

    try {
      await sessionAdapter.sendThinking();
      const result: RunResult = await agent.run(input, { sessionKey, files });
      if (!result.tgSent && result.content) {
        // Warn when agent ran tools but ended without tg_msg — likely the LLM forgot to send final reply
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

  async start(): Promise<void> {
    await registerAllTools();

    const skills = loadSkills();
    const botCommands: Array<{ command: string; description: string }> = [
      { command: 'new', description: '🔄 New practice session' },
    ];

    const skillCommandMap = new Map<string, string>();
    for (const skill of skills) {
      if (!skill.command) continue;
      const cmd = skill.name.replace(/[^a-z0-9_]/g, '_').substring(0, 32);
      const desc = (skill.description || skill.name).substring(0, 256);
      botCommands.push({ command: cmd, description: desc });
      skillCommandMap.set(cmd, skill.name);
    }

    const commandAliases: Array<{ cmd: string; description: string; skill: string }> = [
      { cmd: 'init',     description: '🎯 Initialize study profile', skill: 'profile-manager' },
    ];

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

      // CRITICAL: stop polling and explicitly ACK this /restart update past Telegram's queue BEFORE
      // we exit. Otherwise the new child re-reads the same /restart update on its first getUpdates
      // (offset never advanced) and we loop forever. bot.stop() halts the in-flight long-poll so the
      // explicit getUpdates below doesn't 409 against ourselves.
      try {
        await this.bot.stop();
        await this.bot.api.getUpdates({ offset: updateId + 1, limit: 1, timeout: 0 });
      } catch (err) {
        agentLogger.error({ msg: 'tg_restart_ack_failed', error: (err as Error).message });
      }

      // Remove PID file so the new process doesn't detect "already running"
      const { removePid } = await import('../../lib/pidfile.js');
      removePid('gateway');

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
      // Drop dup from skillCommandMap if alias targets the same command+skill (avoid duplicate registration)
      for (const [existingCmd, existingSkill] of skillCommandMap) {
        if (existingSkill === alias.skill && existingCmd === alias.cmd) {
          skillCommandMap.delete(existingCmd);
          break;
        }
      }
      botCommands.push({ command: alias.cmd, description: alias.description });
    }

    // System commands appended last so they appear at the bottom of the Telegram menu
    botCommands.push(
      { command: 'model', description: '🤖 Switch LLM provider' },
      { command: 'usage', description: '📊 Check API usage' },
      { command: 'restart', description: '♻️ Restart gateway' },
      { command: 'kill', description: '💀 Force stop & clear' },
    );

    await this.bot.api.setMyCommands(botCommands);

    for (const alias of commandAliases) {
      this.bot.command(alias.cmd, async (ctx) => {
        agentLogger.info({ msg: 'tg_alias_command', chatId: ctx.chat.id, cmd: alias.cmd, skill: alias.skill });
        const sessionKey = `tg:${ctx.chat.id}`;
        await createSession(sessionKey);
        const input = `[/command: ${alias.skill}] Run the "${alias.skill}" skill now.`;
        this.enqueuePerChat(ctx.chat.id, () => this.handleIncoming(ctx, input));
      });
    }

    for (const [cmd, skillName] of skillCommandMap) {
      this.bot.command(cmd, async (ctx) => {
        agentLogger.info({ msg: 'tg_skill_command', chatId: ctx.chat.id, skill: skillName });
        const sessionKey = `tg:${ctx.chat.id}`;
        await createSession(sessionKey);
        const input = `[/command: ${skillName}] Run the "${skillName}" skill now.`;
        this.enqueuePerChat(ctx.chat.id, () => this.handleIncoming(ctx, input));
      });
    }

    this.bot.on('message:text', async (ctx) => {
      const input = ctx.message.text;

      agentLogger.info({ msg: 'tg_message', chatId: ctx.chat.id, userId: ctx.from?.id, text: input.substring(0, 100) });
      this.enqueuePerChat(ctx.chat.id, () => this.handleIncoming(ctx, input));
    });

    this.bot.on('message:voice', async (ctx) => {
      agentLogger.info({ msg: 'tg_voice', chatId: ctx.chat.id, userId: ctx.from?.id, duration: ctx.message.voice.duration });

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

      const sttResult = await transcribeAudio(audioPath, this.config);

      if (!sttResult.success || !sttResult.transcript) {
        const errMsg = sttResult.error || 'Could not recognize speech';
        agentLogger.warn({ msg: 'tg_stt_failed', error: errMsg });
        await ctx.reply(`🎤 ${errMsg}`);
        fs.unlink(audioPath, () => {});
        return;
      }

      // Include audio_path so tools (e.g. pron_assess) can reference the file
      const input = `[Voice message | audio_path: ${audioPath}]\n"${sttResult.transcript}"`;
      agentLogger.info({ msg: 'tg_voice_transcribed', chatId: ctx.chat.id, text: sttResult.transcript.substring(0, 100) });
      trackStt(ctx.message.voice.duration || 0);

      this.enqueuePerChat(ctx.chat.id, () => this.handleIncoming(ctx, input));
    });

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

      const ext = path.extname(imagePath).toLowerCase();
      const mimeMap: Record<string, string> = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.png': 'image/png', '.gif': 'image/gif',
        '.webp': 'image/webp', '.bmp': 'image/bmp',
      };
      const mimeType = mimeMap[ext] || 'image/jpeg';

      // Dual-model: analyze via Gemini Vision, then pass description text to the main LLM
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

    this.bot.on('callback_query:data', async (ctx) => {
      const data = ctx.callbackQuery.data;

      // ACK callback FIRST to dismiss Telegram loading spinner
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
      // Client-side pagination — `page:<messageId>:<pageIndex>` edits in-place, no agent call
      else if (data.startsWith('page:')) {
        const parts = data.split(':');
        const msgId = Number(parts[1]);
        const pageIdx = Number(parts[2]);
        const entry = this.paginatedMessages.get(msgId);
        if (entry && pageIdx >= 0 && pageIdx < entry.pages.length) {
          const pageCount = entry.pages.length;
          const navRow: Array<{ text: string; cb: string }> = [];
          if (pageIdx > 0) navRow.push({ text: `⬅️ ${pageIdx}/${pageCount}`, cb: `page:${msgId}:${pageIdx - 1}` });
          if (pageIdx < pageCount - 1) navRow.push({ text: `➡️ ${pageIdx + 2}/${pageCount}`, cb: `page:${msgId}:${pageIdx + 1}` });

          let trailingRows: Array<Array<{ text: string; callback_data: string }>> = [];
          try {
            const parsed = JSON.parse(entry.buttons) as string[][];
            trailingRows = parsed.map((row) =>
              row.map((cell) => {
                const [label, cb] = cell.split('|');
                return { text: label, callback_data: cb || label };
              }),
            );
          } catch { /* ignore bad JSON */ }

          const keyboard = {
            inline_keyboard: [
              ...(navRow.length ? [navRow.map((b) => ({ text: b.text, callback_data: b.cb }))] : []),
              ...trailingRows,
            ],
          };

          try {
            await this.bot.api.editMessageText(entry.chatId, msgId, entry.pages[pageIdx], {
              parse_mode: 'HTML',
              reply_markup: keyboard,
            });
          } catch (err) {
            agentLogger.error({ msg: 'page_flip_failed', msgId, pageIdx, error: (err as Error).message });
          }
        } else {
          agentLogger.warn({ msg: 'page_unknown', data, hasMsgId: !!entry });
        }
      }
      // If source is a menu page, edit-in-place (drill-down feel); otherwise send NEW so the original report stays in history
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
                if (!/[_:]/.test(cd) && getSkill(cd)) return true;
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
      else if (data === 'menu') {
        const menu = getMainMenu();
        if (menu) {
          await ctx.editMessageText(menu.text, {
            reply_markup: menu.keyboard,
          }).catch(() => {});
        }
      }
      // Unmatched button clicks route back into the Agent as a new user input
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

        const matchedSkill = getSkill(data);
        const isSkillSwitch = !!matchedSkill;

        // Skill-switch must not edit the original message — it may hold menu/evaluation content that needs preserving
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
            const sessionAdapter = new TelegramSessionAdapter(ctx as any, this.bot, this.config, this.pendingApprovals, this.pendingChoices, this.activePolls, this.paginatedMessages);
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

    this.bot.on('poll_answer', async (ctx) => {
      const answer = ctx.pollAnswer;
      const pollId = answer.poll_id;
      const poll = this.activePolls.get(pollId);
      if (!poll) return;

      const userId = answer.user?.id;
      const allowedUsers = this.config.telegram.allowed_user_ids;
      if (allowedUsers.length > 0 && userId && !allowedUsers.includes(userId)) return;

      const selectedIdx = answer.option_ids?.[0];
      if (selectedIdx === undefined) return; // user retracted answer

      const selectedOption = poll.options[selectedIdx] || `Option ${selectedIdx}`;
      const isCorrect = selectedIdx === poll.correctIndex;
      const correctOption = poll.options[poll.correctIndex] || `Option ${poll.correctIndex}`;

      const input = isCorrect
        ? `[Quiz answer] User answered: "${selectedOption}" ✅ Correct`
        : `[Quiz answer] User answered: "${selectedOption}" ❌ Wrong (correct: "${correctOption}")`;

      agentLogger.info({ msg: 'tg_poll_answer', chatId: poll.chatId, userId, pollId, selectedIdx, isCorrect });

      this.enqueuePerChat(poll.chatId, async () => {
        // poll_answer ctx has no chat — override chatId on the adapter and send via bot.api
        const sessionKey = `tg:${poll.chatId}`;
        const sessionAdapter = new TelegramSessionAdapter(
          ctx as any, this.bot, this.config, this.pendingApprovals, this.pendingChoices, this.activePolls, this.paginatedMessages,
        );
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

  stop(): void {
    stopScheduler();
    this.bot.stop();
  }
}
