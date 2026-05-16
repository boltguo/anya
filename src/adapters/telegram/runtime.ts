// adapters/telegram/runtime.ts — runtime context shared by commands & handlers

import type { Bot, Context } from 'grammy';
import type { AnyaConfig } from '../../config/defaults.js';
import type { MessageFile } from '../../agent/types.js';
import type { TurnMetadata } from '../../agent/Agent.js';
import type { PendingChoice } from './types.js';

export interface ActivePoll {
  chatId: number;
  options: string[];
  correctIndex: number;
}

export interface PaginatedMessage {
  pages: string[];
  buttons: string;
  chatId: number;
}

export interface TurnIndicators {
  statusMessageId?: number;
}

export interface TelegramRuntime {
  readonly bot: Bot;
  readonly config: AnyaConfig;
  readonly pendingChoices: Map<string, PendingChoice>;
  readonly activePolls: Map<string, ActivePoll>;
  readonly paginatedMessages: Map<number, PaginatedMessage>;

  enqueuePerChat(chatId: number, task: () => Promise<void>): void;
  startTurn(ctx: Context, initialText?: string): Promise<TurnIndicators>;
  handleIncoming(
    ctx: Context,
    input: string,
    files?: MessageFile[],
    preStatusId?: number,
    turnMeta?: TurnMetadata,
  ): Promise<void>;
  cancelPending(): number;
  sendProactiveMessage(chatId: number, text: string): Promise<void>;
}
