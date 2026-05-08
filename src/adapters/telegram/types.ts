/**
 * @module adapters/telegram/types
 * @description Shared type definitions for the Telegram adapter modules.
 */

/**
 * Options for sending messages via the Telegram adapter.
 */
export interface SendMessageOptions {
  /**
   * The parse mode to use for message formatting.
   */
  parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML' | 'none';
  /**
   * The ID of the message or the name of a tagged message to reply to.
   */
  replyTo?: number | string;
  /**
   * An optional tag name to associate with the sent message for later reference (e.g., editing, pinning, replying).
   */
  tag?: string;
}

/**
 * Represents a pending user approval request.
 */
export interface PendingApproval {
  /**
   * Resolves the pending approval with the user's choice.
   *
   * @param value - The user's selection: 'allow', 'deny', or 'always'.
   */
  resolve: (value: 'allow' | 'deny' | 'always') => void;
}

/**
 * Represents a pending user choice from a multi-option prompt.
 */
export interface PendingChoice {
  /**
   * Resolves the pending choice with the selected value.
   *
   * @param value - The value selected by the user.
   */
  resolve: (value: string) => void;
}
