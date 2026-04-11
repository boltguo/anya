/**
 * Core type definitions for the Vela Agent.
 */

/**
 * A message in the conversation history.
 */
export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  toolName?: string;
  /** Transient: raw provider parts for round-tripping (not persisted to DB). */
  _rawParts?: unknown[];
}

/**
 * A tool call requested by the LLM.
 */
export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/**
 * Result of executing a tool.
 */
export interface ToolResult {
  toolCallId: string;
  toolName: string;
  content: string;
  isError?: boolean;
}

/**
 * Response from an LLM provider.
 */
export interface LLMResponse {
  content?: string;
  toolCalls?: ToolCall[];
  /** Raw model parts for round-tripping (preserves thought_signature etc). */
  rawModelParts?: unknown[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Options for creating an Agent instance.
 */
export interface AgentOptions {
  sessionKey: string;
  sessionId?: string;
  newSession?: boolean;
}

/**
 * Adapter interface -- the bridge between Agent and platform (CLI / Telegram).
 */
export interface Adapter {
  /**
   * Display a message to the user.
   */
  reply(content: string): Promise<void>;

  /**
   * Show a tool call to the user (optional, for UI display).
   */
  showToolCall?(toolName: string, args: Record<string, unknown>): void;

  /**
   * Show a tool result to the user (optional).
   */
  showToolResult?(toolName: string, result: string, isError: boolean): void;

  /**
   * Request user approval for a sensitive operation.
   * Returns 'allow', 'deny', or 'always'.
   */
  requestApproval(description: string): Promise<'allow' | 'deny' | 'always'>;
}

/**
 * JSON Schema for a tool's parameters.
 */
export interface ToolParameterSchema {
  type: 'object';
  properties: Record<string, {
    type: string;
    description?: string;
    default?: unknown;
    enum?: unknown[];
  }>;
  required?: string[];
}

/**
 * Definition of a tool that the agent can use.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameterSchema;
  execute: (args: Record<string, unknown>, context: ToolContext) => Promise<string>;
}

/**
 * Context passed to tool execution.
 */
export interface ToolContext {
  adapter: Adapter;
  config: import('../config/defaults.js').VelaConfig;
}
