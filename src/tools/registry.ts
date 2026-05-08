/**
 * @module tools/registry
 * @description Central tool registry for the Anya Agent.
 *
 * Tools register themselves at import time by calling {@link register}.
 * The agent queries the registry at runtime via {@link getToolSchemas} to
 * build LLM function declarations, and via {@link dispatch} to execute
 * tool calls returned by the model.
 *
 * Platform-specific tools (e.g., `tg_msg` for Telegram) are filtered out
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
    import('../tools/file.js'),
    import('../tools/webSearch.js'),
    import('../tools/memory.js'),
    import('../tools/skill.js'),
    import('../tools/clarify.js'),
    import('../tools/telegram.js'),
    import('../tools/tts.js'),
    import('../tools/pronAssess.js'),
    import('../tools/db.js'),
    import('../tools/persist.js'),
    import('../tools/cron.js'),
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
 * the format expected by the LLM provider's function calling API.
 *
 * Filtering layers (applied in order):
 *   1. `config.tools.enabled` — global enabled list
 *   2. Platform — `tg_msg` only included when platform is 'telegram'
 *   3. `toolPolicy.deny` — per-run blacklist
 *   4. `toolPolicy.allow` — per-run whitelist (if set, overrides everything)
 *
 * @param config   - The current agent config.
 * @param platform - Adapter platform string (e.g. 'telegram', 'cron', 'cli').
 * @param toolPolicy - Optional per-run tool filtering policy.
 * @returns Array of tool schemas for the LLM.
 */
export function getToolSchemas(
  config: AnyaConfig,
  platform: string = 'telegram',
  toolPolicy?: { allow?: string[]; deny?: string[] },
): Array<{
  name: string;
  description: string;
  parameters: ToolParameterSchema;
}> {
  let enabled = getEnabledTools(config);

  // Platform filter: tg_msg only for telegram
  if (platform !== 'telegram') {
    enabled = enabled.filter(t => t.name !== 'tg_msg');
  }

  // ToolPolicy: deny list
  if (toolPolicy?.deny?.length) {
    const denySet = new Set(toolPolicy.deny);
    enabled = enabled.filter(t => !denySet.has(t.name));
  }

  // ToolPolicy: allow list (overrides everything above if set)
  if (toolPolicy?.allow?.length) {
    const allowSet = new Set(toolPolicy.allow);
    enabled = enabled.filter(t => allowSet.has(t.name));
  }

  return enabled.map(t => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}

/**
 * Executes a dynamically selected tool process bridging parsed LLM schemas to local operations.
 * Implements hard timeouts, graceful rejections, and context logging injections.
 *
 * @param {string} toolName - Required identifier target.
 * @param {Record<string, unknown>} args - Unsafe payload parameter definitions.
 * @param {ToolContext} context - Application environment injection hooks.
 * @returns {Promise<ToolDispatchResult>} Formatted structural execution telemetry including state flags.
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
  const sid = context.sessionId;
  const DEFAULT_TIMEOUT_MS = 30_000;
  const timeoutMs = tool.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    agentLogger.info({ msg: 'tool_call', tool: toolName, sessionId: sid, args });

    const content = await Promise.race([
      tool.execute(args, context),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Tool "${toolName}" timed out after ${timeoutMs / 1000}s`)), timeoutMs)
      ),
    ]);

    const durationMs = Date.now() - startTime;
    agentLogger.info({ msg: 'tool_result', tool: toolName, sessionId: sid, duration_ms: durationMs, status: 'ok' });

    return { content, isError: false };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);

    agentLogger.error({ msg: 'tool_error', tool: toolName, sessionId: sid, duration_ms: durationMs, error: errorMsg });

    return { content: `Error executing ${toolName}: ${errorMsg}`, isError: true };
  }
}

/**
 * Evaluates the full registry generating structural enabled-flag telemetry.
 *
 * @param {AnyaConfig} config - Operational configurations controlling state validation.
 * @returns {Array<{ name: string; description: string; enabled: boolean }>} Diagnostics interface mappings.
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
