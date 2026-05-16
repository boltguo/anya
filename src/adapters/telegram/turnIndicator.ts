// adapters/telegram/turnIndicator.ts — initial status message

import type { Context } from 'grammy';
import type { TurnIndicators } from './runtime.js';

// Post an initial status message the moment a message arrives — before any
// blocking pre-work (download/STT/vision) or queue wait. The id is handed to
// SessionAdapter so it can edit-in-place instead of spawning a second
// "Thinking..." bubble.
export async function startTurn(ctx: Context, initialText = '🧠 Thinking...'): Promise<TurnIndicators> {
  const msg = await ctx.reply(initialText, { parse_mode: undefined }).catch(() => null);
  return { statusMessageId: msg?.message_id };
}
