import type { ToolDefinition, ToolContext, ToolParameterSchema } from '../agent/types.js';
import type { VelaConfig } from '../config/defaults.js';
import { agentLogger } from '../lib/logger.js';

const tools = new Map<string, ToolDefinition>();

/**
 * Register a tool. Called at import time by each tool module.
 */
export function register(tool: ToolDefinition): void {
  if (tools.has(tool.name)) {
    agentLogger.warn({ msg: 'tool_duplicate', tool: tool.name });
  }
  tools.set(tool.name, tool);
}

/**
 * Get all registered tools.
 */
export function getAllTools(): ToolDefinition[] {
  return [...tools.values()];
}

/**
 * Get only the enabled tools based on config.
 */
export function getEnabledTools(config: VelaConfig): ToolDefinition[] {
  return config.tools.enabled
    .map(name => tools.get(name))
    .filter((t): t is ToolDefinition => t !== undefined);
}

/**
 * Get tool schemas for LLM function calling.
 */
export function getToolSchemas(config: VelaConfig): Array<{
  name: string;
  description: string;
  parameters: ToolParameterSchema;
}> {
  return getEnabledTools(config).map(t => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}

/**
 * Dispatch a tool call and return the result string.
 */
export async function dispatch(
  toolName: string,
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<string> {
  const tool = tools.get(toolName);

  if (!tool) {
    return `Error: Unknown tool "${toolName}". Available tools: ${[...tools.keys()].join(', ')}`;
  }

  const startTime = Date.now();

  try {
    agentLogger.info({ msg: 'tool_call', tool: toolName, args });

    const result = await tool.execute(args, context);

    const durationMs = Date.now() - startTime;
    agentLogger.info({ msg: 'tool_result', tool: toolName, duration_ms: durationMs, status: 'ok' });

    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);

    agentLogger.error({ msg: 'tool_error', tool: toolName, duration_ms: durationMs, error: errorMsg });

    return `Error executing ${toolName}: ${errorMsg}`;
  }
}

/**
 * List all tool names and their status (enabled/disabled).
 */
export function listToolsWithStatus(config: VelaConfig): Array<{
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
