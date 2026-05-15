/**
 * @module index
 * @description Anya — A self-evolving personal AI agent.
 *
 * Public API surface for programmatic usage. Re-exports the core Agent class,
 * type definitions, configuration loader, tool/provider registries, and error
 * classification utilities.
 *
 * For Command Line Interface (CLI) usage, see `bin/anya.ts`.
 */

export { Agent } from './agent/Agent.js';
export type { RunOptions, RunResult } from './agent/Agent.js';
export type { Message, MessageFile, ToolCall, Adapter, ToolDefinition } from './agent/types.js';
export type { AnyaConfig } from './config/defaults.js';
export { loadConfig, getConfig, saveConfig } from './config/loader.js';
export * from './providers/openai.js';
export { createProvider } from './providers/index.js';
export { register as registerTool, registerAllTools } from './tools/registry.js';
export { classifyApiError } from './agent/errorClassifier.js';
export type { FailoverReason, ClassifiedError } from './agent/errorClassifier.js';
export type { ContextEngine } from './agent/contextCompressor.js';
