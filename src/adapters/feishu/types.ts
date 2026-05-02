/**
 * @module adapters/feishu/types
 * @description Shared types for the Feishu adapter modules.
 */

export interface PendingApproval {
  resolve: (value: 'allow' | 'deny' | 'always') => void;
}

export interface PendingChoice {
  resolve: (value: string) => void;
}
