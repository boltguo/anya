// adapters/telegram/handlers/text.ts — plain text messages

import { agentLogger } from '../../../lib/logger.js';
import type { TelegramRuntime } from '../runtime.js';

export function registerTextHandler(rt: TelegramRuntime): void {
  rt.bot.on('message:text', async (ctx) => {
    const input = ctx.message.text;

    agentLogger.info({ msg: 'tg_message', chatId: ctx.chat.id, userId: ctx.from?.id, text: input.substring(0, 100) });
    const { stopTyping, statusMessageId } = await rt.startTurn(ctx);
    rt.enqueuePerChat(ctx.chat.id, () =>
      rt.handleIncoming(ctx, input, stopTyping, undefined, statusMessageId),
    );
  });
}
