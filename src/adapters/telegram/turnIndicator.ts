// adapters/telegram/turnIndicator.ts — typing heartbeat + initial status message

import type { Context } from 'grammy';
import { startTypingIndicator } from './errors.js';
import type { TurnIndicators } from './runtime.js';

// Fire typing + post an initial status message the moment a message arrives —
// before any blocking pre-work (download/STT/vision) or queue wait. The status
// message id is later handed to SessionAdapter so it can edit-in-place instead
// of spawning a second "Thinking..." bubble.
export async function startTurn(ctx: Context, initialText = '🧠 Thinking...'): Promise<TurnIndicators> {
  const typingInterval = startTypingIndicator(ctx);
  const msg = await ctx.reply(initialText, { parse_mode: undefined }).catch(() => null);
  return {
    stopTyping: () => clearInterval(typingInterval),
    statusMessageId: msg?.message_id,
  };
}
