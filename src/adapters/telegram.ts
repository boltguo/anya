import { Bot, InlineKeyboard } from 'grammy';
import type { Adapter, Message } from '../agent/types.js';
import type { VelaConfig } from '../config/defaults.js';
import { Agent, type RunResult } from '../agent/Agent.js';
import { agentLogger } from '../lib/logger.js';

/**
 * Telegram adapter using grammy.
 *
 * Each chat_id maps to a unique session. Approval requests
 * are handled via Inline Keyboard buttons.
 */
export class TelegramAdapter implements Adapter {
  private bot: Bot;
  private config: VelaConfig;
  private pendingApprovals = new Map<string, {
    resolve: (value: 'allow' | 'deny' | 'always') => void;
  }>();

  constructor(config: VelaConfig) {
    if (!config.telegram.bot_token) {
      throw new Error('Telegram bot_token not configured. Run "vela init" or "vela config edit".');
    }

    this.config = config;
    this.bot = new Bot(config.telegram.bot_token);
    this.currentChatId = 0;
  }

  private currentChatId: number;

  async reply(content: string): Promise<void> {
    if (!this.currentChatId) return;

    // Telegram has a 4096 char limit per message
    const maxLen = 4000;
    if (content.length <= maxLen) {
      await this.bot.api.sendMessage(this.currentChatId, content, {
        parse_mode: 'Markdown',
      }).catch(() => {
        // Fallback: send without markdown if parsing fails
        return this.bot.api.sendMessage(this.currentChatId, content);
      });
    } else {
      // Split into chunks
      for (let i = 0; i < content.length; i += maxLen) {
        const chunk = content.substring(i, i + maxLen);
        await this.bot.api.sendMessage(this.currentChatId, chunk).catch(() => {});
      }
    }
  }

  showToolCall(toolName: string, args: Record<string, unknown>): void {
    if (!this.currentChatId) return;
    const argsStr = Object.entries(args)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(', ');
    this.bot.api.sendMessage(
      this.currentChatId,
      `[tool] ${toolName}(${argsStr})`,
    ).catch(() => {});
  }

  showToolResult(toolName: string, result: string, isError: boolean): void {
    if (!this.currentChatId) return;
    const status = isError ? '[fail]' : '[done]';
    const preview = result.length > 200 ? result.substring(0, 200) + '...' : result;
    this.bot.api.sendMessage(
      this.currentChatId,
      `${status} ${toolName}: ${preview}`,
    ).catch(() => {});
  }

  async requestApproval(description: string): Promise<'allow' | 'deny' | 'always'> {
    if (!this.currentChatId) return 'deny';

    const approvalId = `approval_${Date.now()}`;

    const keyboard = new InlineKeyboard()
      .text('Allow', `${approvalId}:allow`)
      .text('Deny', `${approvalId}:deny`)
      .text('Always Allow', `${approvalId}:always`);

    await this.bot.api.sendMessage(
      this.currentChatId,
      `Approval Required\n\n${description}`,
      { reply_markup: keyboard },
    );

    // Wait for the callback query
    return new Promise<'allow' | 'deny' | 'always'>((resolve) => {
      this.pendingApprovals.set(approvalId, { resolve });

      // Timeout after 5 minutes -- default to deny
      setTimeout(() => {
        if (this.pendingApprovals.has(approvalId)) {
          this.pendingApprovals.delete(approvalId);
          resolve('deny');
        }
      }, 5 * 60 * 1000);
    });
  }

  /**
   * Start the bot and begin listening for messages.
   */
  async start(): Promise<void> {
    const agent = new Agent(this.config, this);
    const allowedUsers = this.config.telegram.allowed_user_ids;

    // Handle text messages
    this.bot.on('message:text', async (ctx) => {
      const userId = ctx.from?.id;

      // Auth check
      if (allowedUsers.length > 0 && userId && !allowedUsers.includes(userId)) {
        await ctx.reply('Unauthorized. Your user ID is not in the allowed list.');
        agentLogger.warn({ msg: 'unauthorized_user', userId, chatId: ctx.chat.id });
        return;
      }

      this.currentChatId = ctx.chat.id;
      const sessionKey = `tg:${ctx.chat.id}`;
      const input = ctx.message.text;

      agentLogger.info({ msg: 'tg_message', chatId: ctx.chat.id, userId, text: input.substring(0, 100) });

      try {
        const result: RunResult = await agent.run(input, { sessionKey });
        await this.reply(result.content);
      } catch (err) {
        const error = err as Error;
        agentLogger.error({ msg: 'tg_error', chatId: ctx.chat.id, error: error.message });
        await ctx.reply(`Error: ${error.message}`);
      }
    });

    // Handle callback queries (approval buttons)
    this.bot.on('callback_query:data', async (ctx) => {
      const data = ctx.callbackQuery.data;
      const [approvalId, action] = data.split(':');

      const pending = this.pendingApprovals.get(approvalId);
      if (pending) {
        this.pendingApprovals.delete(approvalId);
        pending.resolve(action as 'allow' | 'deny' | 'always');

        // Update the message to show the result
        const statusText = action === 'allow' ? 'Allowed' : action === 'always' ? 'Always Allowed' : 'Denied';
        await ctx.editMessageText(
          ctx.callbackQuery.message?.text + `\n\n-> ${statusText}`,
        ).catch(() => {});
      }

      await ctx.answerCallbackQuery();
    });

    // Handle /start command
    this.bot.command('start', async (ctx) => {
      await ctx.reply(
        `Hi! I'm ${this.config.agent.name}, your personal AI assistant.\n\nSend me any message and I'll help you with it.`,
      );
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

  /**
   * Stop the bot gracefully.
   */
  stop(): void {
    this.bot.stop();
  }
}
