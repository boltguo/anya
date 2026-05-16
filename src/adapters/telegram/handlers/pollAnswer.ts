// adapters/telegram/handlers/pollAnswer.ts — quiz poll answer routing

import { Agent, type RunResult } from '../../../agent/Agent.js';
import { agentLogger } from '../../../lib/logger.js';
import { TelegramSessionAdapter } from '../SessionAdapter.js';
import type { TelegramRuntime } from '../runtime.js';

export function registerPollAnswerHandler(rt: TelegramRuntime): void {
  rt.bot.on('poll_answer', async (ctx) => {
    const answer = ctx.pollAnswer;
    const pollId = answer.poll_id;
    const poll = rt.activePolls.get(pollId);
    if (!poll) return;

    const userId = answer.user?.id;
    const allowedUsers = rt.config.telegram.allowed_user_ids;
    if (allowedUsers.length > 0 && userId && !allowedUsers.includes(userId)) return;

    const selectedIdx = answer.option_ids?.[0];
    if (selectedIdx === undefined) return; // user retracted answer

    const selectedOption = poll.options[selectedIdx] || `Option ${selectedIdx}`;
    const isCorrect = selectedIdx === poll.correctIndex;
    const correctOption = poll.options[poll.correctIndex] || `Option ${poll.correctIndex}`;

    agentLogger.info({ msg: 'tg_poll_answer', chatId: poll.chatId, userId, pollId, selectedIdx, isCorrect });

    rt.enqueuePerChat(poll.chatId, async () => {
      // poll_answer ctx has no chat — override chatId on the adapter and send via bot.api
      const sessionKey = `tg:${poll.chatId}`;
      const sessionAdapter = new TelegramSessionAdapter(
        ctx as any, rt.bot, rt.config, rt.pendingChoices, rt.activePolls, rt.paginatedMessages,
      );
      sessionAdapter.setChatIdOverride(poll.chatId);
      const agent = new Agent(rt.config, sessionAdapter);

      try {
        const result: RunResult = await agent.run(selectedOption, {
          sessionKey,
          turnMeta: {
            trigger: 'poll',
            details: {
              selected: selectedOption,
              correct_answer: correctOption,
              correct: isCorrect,
            },
          },
        });
        if (!result.tgSent && result.content) {
          await sessionAdapter.reply(result.content);
        }
      } catch (err) {
        agentLogger.error({ msg: 'tg_poll_answer_error', chatId: poll.chatId, error: (err as Error).message });
      }
    });

    rt.activePolls.delete(pollId);
  });
}
