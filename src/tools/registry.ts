/**
 * @module tools/registry
 * @description Central tool registry for the Anya Agent.
 *
 * Tools register themselves at import time by calling {@link register}.
 * The agent queries the registry at runtime via {@link getToolSchemas} to
 * build LLM function declarations, and via {@link dispatch} to execute
 * tool calls returned by the model.
 *
 * Platform-specific tools (e.g., `tg` for Telegram) are filtered out
 * when not applicable, saving prompt tokens.
 */

import type { ToolDefinition, ToolContext, ToolParameterSchema, ToolDispatchResult } from '../agent/types.js';
import type { AnyaConfig } from '../config/defaults.js';
import { agentLogger } from '../lib/logger.js';

let toolsLoaded = false;

/**
 * Ensure all built-in tools are registered exactly once.
 * Replaces the former side-effect import pattern.
 */
export async function registerAllTools(): Promise<void> {
  if (toolsLoaded) return;
  toolsLoaded = true;
  await Promise.all([
    import('../tools/fileTools.js'),
    import('../tools/shellTool.js'),
    import('../tools/webSearch.js'),
    import('../tools/memoryTools.js'),
    import('../tools/skillTools.js'),
    import('../tools/clarifyTools.js'),
    import('../tools/telegramTools.js'),
    import('../tools/tts.js'),
    import('../tools/imageGen.js'),
  ]);
}

/** Internal store of all registered tools, keyed by tool name. */
const tools = new Map<string, ToolDefinition>();

/**
 * Register a tool with the global registry.
 *
 * Called at module import time by each tool file. Duplicate names
 * are logged as warnings but silently overwritten.
 *
 * @param tool - The tool definition to register.
 *
 * @example
 * ```typescript
 * register({
 *   name: 'my_tool',
 *   description: 'Does something useful.',
 *   parameters: { type: 'object', properties: { ... }, required: ['...'] },
 *   async execute(args, context) { return JSON.stringify({ ok: true }); },
 * });
 * ```
 */
export function register(tool: ToolDefinition): void {
  if (tools.has(tool.name)) {
    agentLogger.warn({ msg: 'tool_duplicate', tool: tool.name });
  }
  tools.set(tool.name, tool);
}

/**
 * Get all registered tools (regardless of config enablement).
 * @returns Array of all tool definitions.
 */
export function getAllTools(): ToolDefinition[] {
  return [...tools.values()];
}

/**
 * Get only the tools enabled in the agent configuration.
 *
 * @param config - The current agent config (contains `tools.enabled` list).
 * @returns Array of enabled tool definitions, in config order.
 */
export function getEnabledTools(config: AnyaConfig): ToolDefinition[] {
  return config.tools.enabled
    .map(name => tools.get(name))
    .filter((t): t is ToolDefinition => t !== undefined);
}

/**
 * Get tool schemas formatted for LLM function calling.
 *
 * Returns the enabled tools' name, description, and parameter schema —
 * the format expected by Gemini's `tools[].function_declarations`.
 *
 * Platform-specific tools are filtered based on the `isTelegram` flag
 * to avoid wasting prompt tokens on inapplicable tools.
 *
 * @param config - The current agent config.
 * @param isTelegram - Whether the current session is via Telegram.
 *                     When false, the `tg` tool is excluded.
 * @returns Array of tool schemas for the LLM.
 */
export function getToolSchemas(config: AnyaConfig, isTelegram: boolean = false): Array<{
  name: string;
  description: string;
  parameters: ToolParameterSchema;
}> {
  return getEnabledTools(config)
    .filter(t => isTelegram || t.name !== 'tg')
    .map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
}

/**
 * Dispatch a tool call and return a structured result.
 *
 * Looks up the tool by name, executes it with the provided args and
 * context, and returns a {@link ToolDispatchResult} with an explicit
 * `isError` flag — no more guessing from string prefixes.
 */
export async function dispatch(
  toolName: string,
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolDispatchResult> {
  const tool = tools.get(toolName);

  if (!tool) {
    return {
      content: `Error: Unknown tool "${toolName}". Available tools: ${[...tools.keys()].join(', ')}`,
      isError: true,
    };
  }

  const startTime = Date.now();

  try {
    agentLogger.info({ msg: 'tool_call', tool: toolName, args });

    const content = await tool.execute(args, context);

    const durationMs = Date.now() - startTime;
    agentLogger.info({ msg: 'tool_result', tool: toolName, duration_ms: durationMs, status: 'ok' });

    return { content, isError: false };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);

    agentLogger.error({ msg: 'tool_error', tool: toolName, duration_ms: durationMs, error: errorMsg });

    return { content: `Error executing ${toolName}: ${errorMsg}`, isError: true };
  }
}

/**
 * List all registered tools with their enabled/disabled status.
 *
 * Useful for debugging and the `anya tools` CLI command.
 *
 * @param config - The current agent config.
 * @returns Array of tool info objects with name, description, and enabled flag.
 */
export function listToolsWithStatus(config: AnyaConfig): Array<{
  name: string;
  description: string;
  enabled: boolean;
}> {
  return getAllTools().map(t => ({
    name: t.name,
    description: t.description,
    enabled: config.tools.enabled.includes(t.name),
  }));
}
