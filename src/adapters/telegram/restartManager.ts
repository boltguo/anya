// adapters/telegram/restartManager.ts — `/restart` spawn-self logic

import path from 'node:path';
import type { Context } from 'grammy';
import { agentLogger } from '../../lib/logger.js';
import type { TelegramRuntime } from './runtime.js';

const DRAIN_TIMEOUT_MS = 8000;

// Stop polling, ACK the /restart update so the new child doesn't re-read it,
// drain in-flight per-chat tasks (with timeout) so we don't kill mid-response,
// edit any leftover status messages so they don't sit as orphan spinners,
// then spawn a detached replacement and exit. The new child reaps stray gateways.
export async function handleRestart(ctx: Context, rt: TelegramRuntime): Promise<void> {
  const updateId = ctx.update.update_id;
  agentLogger.info({ msg: 'tg_restart_command', chatId: ctx.chat?.id, userId: ctx.from?.id, updateId });
  const statusMsg = await ctx.reply('🔄 Restarting gateway...');

  // CRITICAL: stop polling and ACK this /restart update so the new child doesn't re-read it.
  // bot.stop() halts the in-flight long-poll so the explicit getUpdates below doesn't 409.
  try {
    await rt.bot.stop();
    await rt.bot.api.getUpdates({ offset: updateId + 1, limit: 1, timeout: 0 });
  } catch (err) {
    agentLogger.error({ msg: 'tg_restart_ack_failed', error: (err as Error).message });
  }

  // Let in-flight per-chat tasks finish so we don't kill a half-sent practice question.
  const drained = await rt.drainQueue(DRAIN_TIMEOUT_MS);
  agentLogger.info({ msg: 'tg_restart_drain', drained, timeoutMs: DRAIN_TIMEOUT_MS });

  // Anything still in liveStatusMessages = orphan spinner that the user is staring at.
  // Edit each to a clear "restarted" notice so they don't sit forever as "Thinking...".
  // Failures (message already deleted by a clean cleanupStatus) are swallowed.
  for (const [chatId, messageId] of rt.liveStatusMessages) {
    if (chatId === ctx.chat?.id && messageId === statusMsg.message_id) continue; // skip our own restart banner
    await rt.bot.api
      .editMessageText(chatId, messageId, '⚠️ 已被 /restart 打断，重新发条消息继续。')
      .catch(() => {});
  }

  // Clear pid file; the new child will overwrite after reaping any orphan.
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
    await rt.bot.api.editMessageText(
      ctx.chat!.id,
      statusMsg.message_id,
      `✅ Gateway restarted (PID ${child.pid}).`,
    );
  } catch { /* best effort */ }

  process.exit(0);
}
