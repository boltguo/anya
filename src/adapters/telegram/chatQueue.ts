// adapters/telegram/chatQueue.ts — per-chat serial Promise chain

import { agentLogger } from '../../lib/logger.js';

export class ChatQueue {
  private queues = new Map<number, Promise<void>>();

  enqueue(chatId: number, task: () => Promise<void>): void {
    const prev = this.queues.get(chatId) ?? Promise.resolve();
    const next = prev.then(task).catch((err) => {
      agentLogger.error({ msg: 'tg_queue_task_error', chatId, error: (err as Error).message });
    });
    this.queues.set(chatId, next);
    next.then(() => {
      if (this.queues.get(chatId) === next) {
        this.queues.delete(chatId);
      }
    });
  }
}
