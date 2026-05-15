// adapters/telegram/TelegramAdapter.ts — Telegram gateway: lifecycle + shared state

import { Bot, type Context } from 'grammy';
import { Agent, type RunResult } from '../../agent/Agent.js';
import { registerAllTools } from '../../tools/registry.js';
import { agentLogger } from '../../lib/logger.js';
import type { AnyaConfig } from '../../config/defaults.js';
import type { MessageFile } from '../../agent/types.js';

import { TelegramSessionAdapter } from './SessionAdapter.js';
import { formatTgError } from './errors.js';
import { startScheduler, stopScheduler } from '../../services/scheduler.js';
import { markdownToTelegramHtml } from './format.js';

import { ChatQueue } from './chatQueue.js';
import { startTurn } from './turnIndicator.js';
import { registerCommands } from './commands.js';
import { registerTextHandler } from './handlers/text.js';
import { registerVoiceHandler } from './handlers/voice.js';
import { registerPhotoHandler } from './handlers/photo.js';
import { registerCallbackHandler } from './handlers/callback.js';
import { registerPollAnswerHandler } from './handlers/pollAnswer.js';
import type {
  TelegramRuntime,
  ActivePoll,
  PaginatedMessage,
  TurnIndicators,
} from './runtime.js';
import type { PendingApproval, PendingChoice } from './types.js';

export class TelegramAdapter implements TelegramRuntime {
  readonly bot: Bot;
  readonly config: AnyaConfig;
  readonly pendingApprovals = new Map<string, PendingApproval>();
  readonly pendingChoices = new Map<string, PendingChoice>();
  readonly activePolls = new Map<string, ActivePoll>();
  readonly paginatedMessages = new Map<number, PaginatedMessage>();

  private readonly chatQueue = new ChatQueue();

  constructor(config: AnyaConfig) {
    if (!config.telegram.bot_token) {
      throw new Error('Telegram bot_token not configured. Run "anya init" or "anya config edit".');
    }

    this.config = config;
    this.bot = new Bot(config.telegram.bot_token);
  }

  cancelPending(): number {
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

  enqueuePerChat(chatId: number, task: () => Promise<void>): void {
    this.chatQueue.enqueue(chatId, task);
  }

  startTurn(ctx: Context, initialText?: string): Promise<TurnIndicators> {
    return startTurn(ctx, initialText);
  }

  async sendProactiveMessage(chatId: number, text: string): Promise<void> {
    await this.bot.api.sendMessage(chatId, markdownToTelegramHtml(text), {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    }).catch(() => this.bot.api.sendMessage(chatId, text, {
      link_preview_options: { is_disabled: true },
    }));
  }

  async handleIncoming(
    ctx: Context,
    input: string,
    cleanup?: () => void,
    files?: MessageFile[],
    preStatusId?: number,
  ): Promise<void> {
    const userId = ctx.from?.id;
    const allowedUsers = this.config.telegram.allowed_user_ids;

    if (allowedUsers.length > 0 && userId && !allowedUsers.includes(userId)) {
      await ctx.reply('⛔ Unauthorized. Your user ID is not in the allowed list.');
      agentLogger.warn({ msg: 'unauthorized_user', userId, chatId: ctx.chat!.id });
      return;
    }

    const sessionKey = `tg:${ctx.chat!.id}`;

    agentLogger.info({ msg: 'tg_incoming', chatId: ctx.chat!.id, userId, input: input.substring(0, 200) });

    const sessionAdapter = new TelegramSessionAdapter(
      ctx, this.bot, this.config, this.pendingApprovals, this.pendingChoices, this.activePolls, this.paginatedMessages,
    );
    if (preStatusId) sessionAdapter.attachStatusMessage(preStatusId);
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
      cleanup?.();
    }
  }

  async start(): Promise<void> {
    await registerAllTools();

    await registerCommands(this);
    registerTextHandler(this);
    registerVoiceHandler(this);
    registerPhotoHandler(this);
    registerCallbackHandler(this);
    registerPollAnswerHandler(this);

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
