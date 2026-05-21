// agent/types.ts — agent framework type definitions

// Transient — never persisted; Agent degrades file-bearing messages before save.
export interface MessageFile {
  path: string;
  mimeType: string;
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  files?: MessageFile[];
  toolCalls?: ToolCall[];
  toolCallId?: string;
  toolName?: string;
  _rawParts?: unknown;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ToolDispatchResult {
  content: string;
  isError: boolean;
}

export interface LLMResponse {
  content?: string;
  toolCalls?: ToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cachedTokens?: number;
    thoughtsTokens?: number;
  };
  rawModelParts?: unknown;
  durationMs?: number;
}

export interface ChatOptions {
  sessionId?: string;
  // Per-call model override. When set, takes precedence over config.provider.model.
  // Used by llmSubroutine to route lightweight focused generations (sentence
  // generation, rubric grading) through a smaller/faster model variant while
  // the main agent loop keeps the heavier default.
  model?: string;
}

export interface LLMProvider {
  readonly name: string;

  chat(
    messages: Message[],
    tools: Array<{ name: string; description: string; parameters: ToolParameterSchema }>,
    config: import('../config/defaults.js').AnyaConfig,
    options?: ChatOptions,
  ): Promise<LLMResponse>;
}

export interface Adapter {
  readonly platform: string;

  reply(content: string): Promise<void>;

  showToolCall?(toolName: string, args: Record<string, unknown>): void;

  showToolResult?(toolName: string, result: string, isError: boolean): void;

  requestChoice?(description: string, choices: string[]): Promise<string>;
}

export interface ToolParameterSchema {
  type: 'object';
  properties: Record<string, {
    type: string;
    description?: string;
    default?: unknown;
    enum?: unknown[];
    items?: { type: string };
  }>;
  required?: string[];
}

export type ToolTier = 'baseline' | 'compound';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameterSchema;
  // 'baseline' = always exposed to LLM. 'compound' = only exposed when the
  // session's active_skill lists it in `required_tools`. Defaults to baseline
  // when omitted, preserving existing tool behavior.
  tier?: ToolTier;
  timeoutMs?: number;
  execute: (args: Record<string, unknown>, context: ToolContext) => Promise<string>;
}

export interface ToolContext {
  adapter: Adapter;
  config: import('../config/defaults.js').AnyaConfig;
  sessionId?: string;
  sessionKey?: string;
}
