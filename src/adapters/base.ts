import type { Adapter } from '../agent/types.js';

/**
 * Base adapter -- abstract interface for platform bridges.
 * CLI and Telegram adapters extend this.
 */
export abstract class BaseAdapter implements Adapter {
  abstract reply(content: string): Promise<void>;
  abstract requestApproval(description: string): Promise<'allow' | 'deny' | 'always'>;

  showToolCall?(toolName: string, args: Record<string, unknown>): void;
  showToolResult?(toolName: string, result: string, isError: boolean): void;
}
