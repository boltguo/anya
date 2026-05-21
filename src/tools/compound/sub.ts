// tools/compound/sub.ts — shared helpers for compound tools.
//
// Compound tools chain multiple atomic operations (pron_assess + persist + LLM
// subroutine etc). Without explicit logging, those internal steps disappear
// from the agent log — a regression in observability. `logToolSubcall` wraps
// each internal step so we keep the call graph visible while preserving the
// outer `tool_call`/`tool_result` boundary the LLM sees.

import { agentLogger } from '../../lib/logger.js';
import type { ToolDefinition } from '../../agent/types.js';
import { register } from '../registry.js';

export interface SubcallContext {
  parent: string;       // outer compound tool name
  sessionId?: string;
}

/**
 * Wrap an internal step of a compound tool. Logs duration and outcome under
 * `tool_subcall` so the agent.log retains visibility into multi-step pipelines.
 *
 * Re-throws after logging — callers decide whether to swallow vs propagate.
 */
export async function logToolSubcall<T>(
  ctx: SubcallContext,
  subName: string,
  args: Record<string, unknown>,
  fn: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await fn();
    agentLogger.info({
      msg: 'tool_subcall',
      parent: ctx.parent,
      sub: subName,
      sessionId: ctx.sessionId,
      duration_ms: Date.now() - startedAt,
      status: 'ok',
      args,
    });
    return result;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    agentLogger.error({
      msg: 'tool_subcall',
      parent: ctx.parent,
      sub: subName,
      sessionId: ctx.sessionId,
      duration_ms: Date.now() - startedAt,
      status: 'error',
      error: errorMsg,
      args,
    });
    throw err;
  }
}

/**
 * Convenience wrapper: register a compound tool with `tier: 'compound'` already
 * applied. Use instead of calling `register()` directly so the tier classification
 * is uniform across all compound tools.
 */
export function registerCompoundTool(definition: Omit<ToolDefinition, 'tier'>): void {
  register({ ...definition, tier: 'compound' });
}
