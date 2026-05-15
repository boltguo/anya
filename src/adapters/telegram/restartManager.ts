// adapters/telegram/restartManager.ts — `/restart` spawn-self logic

import path from 'node:path';
import type { Bot, Context } from 'grammy';
import { agentLogger } from '../../lib/logger.js';

// Stop polling, ACK the /restart update so the new child doesn't re-read it,
// then spawn a detached replacement and exit. The new child reaps any stray
// gateway processes before claiming the pid file.
export async function handleRestart(ctx: Context, bot: Bot): Promise<void> {
  const updateId = ctx.update.update_id;
  agentLogger.info({ msg: 'tg_restart_command', chatId: ctx.chat?.id, userId: ctx.from?.id, updateId });
  const statusMsg = await ctx.reply('🔄 Restarting gateway...');

  // CRITICAL: stop polling and explicitly ACK this /restart update past Telegram's queue BEFORE
  // we exit. Otherwise the new child re-reads the same /restart update on its first getUpdates
  // (offset never advanced) and we loop forever. bot.stop() halts the in-flight long-poll so the
  // explicit getUpdates below doesn't 409 against ourselves.
  try {
    await bot.stop();
    await bot.api.getUpdates({ offset: updateId + 1, limit: 1, timeout: 0 });
  } catch (err) {
    agentLogger.error({ msg: 'tg_restart_ack_failed', error: (err as Error).message });
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
    await bot.api.editMessageText(
      ctx.chat!.id,
      statusMsg.message_id,
      `✅ Gateway restarted (PID ${child.pid}).`,
    );
  } catch { /* best effort */ }

  process.exit(0);
}
