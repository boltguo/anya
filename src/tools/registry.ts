// tools/registry.ts — tool registration + dispatch

import type { ToolDefinition, ToolContext, ToolParameterSchema, ToolDispatchResult } from '../agent/types.js';
import type { AnyaConfig } from '../config/defaults.js';
import { agentLogger } from '../lib/logger.js';

let toolsLoaded = false;

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
    import('../tools/persist.js'),
    import('../tools/cron.js'),
  ]);
}

const tools = new Map<string, ToolDefinition>();

export function register(tool: ToolDefinition): void {
  if (tools.has(tool.name)) {
    agentLogger.warn({ msg: 'tool_duplicate', tool: tool.name });
  }
  tools.set(tool.name, tool);
}

// Filter order: platform → deny → allow (allow is a hard override).
export function getToolSchemas(
  _config: AnyaConfig,
  platform: string = 'telegram',
  toolPolicy?: { allow?: string[]; deny?: string[] },
): Array<{
  name: string;
  description: string;
  parameters: ToolParameterSchema;
}> {
  let enabled = [...tools.values()];

  if (platform !== 'telegram') {
    enabled = enabled.filter(t => t.name !== 'tg_msg');
  }

  if (toolPolicy?.deny?.length) {
    const denySet = new Set(toolPolicy.deny);
    enabled = enabled.filter(t => !denySet.has(t.name));
  }

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

