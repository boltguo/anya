/**
 * @module adapters/base
 * @description Abstract base class for platform adapters.
 *
 * Provides the inheritance-based adapter pattern used by CLI and Telegram
 * adapters. Implements the {@link Adapter} interface with optional methods
 * for tool call/result display.
 */

import type { Adapter } from '../agent/types.js';

/**
 * Base adapter -- abstract interface for platform bridges.
 * CLI and Telegram adapters extend this.
 */
export abstract class BaseAdapter implements Adapter {
  abstract readonly platform: 'cli' | 'telegram' | 'cron';
  abstract reply(content: string): Promise<void>;
  abstract requestApproval(description: string): Promise<'allow' | 'deny' | 'always'>;

  showToolCall?(toolName: string, args: Record<string, unknown>): void;
  showToolResult?(toolName: string, result: string, isError: boolean): void;
}
