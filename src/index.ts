/**
 * Vela - A self-evolving personal AI agent.
 *
 * This module exports the core Agent class for programmatic usage.
 * For CLI usage, see bin/vela.ts.
 */

export { Agent } from './agent/Agent.js';
export type { RunOptions, RunResult } from './agent/Agent.js';
export type { Message, ToolCall, ToolResult, Adapter, ToolDefinition } from './agent/types.js';
export type { VelaConfig } from './config/defaults.js';
export { loadConfig, getConfig, saveConfig } from './config/loader.js';
export { getProvider, registerProvider } from './providers/registry.js';
export { register as registerTool } from './tools/registry.js';
