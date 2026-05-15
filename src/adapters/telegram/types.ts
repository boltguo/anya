// adapters/telegram/types.ts — shared telegram adapter types

export interface SendMessageOptions {
  parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML' | 'none';
  replyTo?: number | string;
  tag?: string;
}

export interface PendingApproval {
  resolve: (value: 'allow' | 'deny' | 'always') => void;
}

export interface PendingChoice {
  resolve: (value: string) => void;
}
