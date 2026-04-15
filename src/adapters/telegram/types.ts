/**
 * @module adapters/telegram/types
 * @description Shared types for the Telegram adapter modules.
 */

export interface SendMessageOptions {
  parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML' | 'none';
  /** message_id or tag name */
  replyTo?: number | string;
  /** tag this message for later reference (edit, pin, reply-to) */
  tag?: string;
}

export interface InlineButtonRow {
  label: string;
  data: string;
}

export interface PendingApproval {
  resolve: (value: 'allow' | 'deny' | 'always') => void;
}

export interface PendingChoice {
  resolve: (value: string) => void;
}
