/**
 * @module agent/contextCompressor
 * @description State-aware contextual compression utility.
 *
 * Implements a segmented compression architecture for the conversation memory:
 * 1. **Protection Zones**: Strictly preserves the system configuration (head)
 *    and the most recent user dialogue (tail).
 * 2. **Summarization**: Isolates the middle historical payload and proxies it
 *    to an LLM instruction model to generate a structured semantic summary.
 * 3. **Tool Pre-trimming**: Proactively truncates oversized tool outputs prior
 *    to summarization to maximize the extraction density for the LLM call.
 *
 * Operates on a synchronous threshold combined with asynchronous execution:
 * The Agent runs a cheap validation check synchronously on each loop; if exceeded,
 * the costly summarization routine is invoked over the wire.
 */

import type { Message, LLMProvider } from './types.js';
import type { AnyaConfig } from '../config/defaults.js';
import { agentLogger } from '../lib/logger.js';

/**
 * Defines the contract for an autonomous context engine capable of measuring
 * and compressing runtime messages based on specific threshold parameters.
 */
export interface ContextEngine {
  /**
   * Assesses if the context has surpassed optimal operational boundaries.
   *
   * @param messages - The complete conversation sequence.
   * @param estimatedTokens - Currently projected active token sum.
   * @param contextLimit - The total theoretical bounds provided by the model limit.
   * @returns True if compression should be forcefully invoked.
   */
  shouldCompress(messages: Message[], estimatedTokens: number, contextLimit: number): boolean;

  /**
   * Transforms the extended context sequence into a dense summarized equivalent.
   *
   * @param messages - The original conversation sequence.
   * @param contextLimit - The boundaries guiding summarization logic.
   * @returns A promise yielding the newly compacted message array.
   */
  compress(messages: Message[], contextLimit: number): Promise<Message[]>;
}

const PROTECT_HEAD = 3;
const PROTECT_TAIL = 8;
const MAX_TOOL_RESULT_CHARS = 2000;

const SUMMARY_SYSTEM_PROMPT = `You are a conversation summariser. Given a section of conversation history between a user and an AI assistant, produce a structured summary in this exact format:

**Goal**: What the user is trying to accomplish (1-2 sentences)
**Progress**: What has been done so far (bullet list, max 5 items)
**Decisions**: Key decisions made and their reasons (bullet list)
**Pending**: Open questions or unresolved items (bullet list, or "None")
**Key Data**: Important file paths, variable names, URLs, numbers mentioned (bullet list, or "None")

Be concise. Preserve technical details (exact paths, commands, error messages) that would be needed to continue the work. Omit pleasantries and filler.`;

/**
 * Standard implementation of the ContextEngine leveraging the primary LLM provider
 * to formulate structural summaries of the historical payload.
 */
export class ContextCompressor implements ContextEngine {
  private config: AnyaConfig;
  private provider: LLMProvider;
  private thresholdRatio: number;

  /**
   * Initializes the context compression service.
   *
   * @param config - The application configuration.
   * @param provider - An LLM interface for dispatching the summarization prompt.
   */
  constructor(config: AnyaConfig, provider: LLMProvider) {
    this.config = config;
    this.provider = provider;
    this.thresholdRatio = config.advanced.compress_threshold || 0.75;
  }

  /**
   * Determines whether the current context should be compressed.
   *
   * Triggers compression in two scenarios:
   * 1. **Context limit**: Approaching the model's maximum context window (e.g., 75% of 400K).
   * 2. **Economic threshold**: Token count exceeds a practical ceiling (30K) with enough
   *    messages to indicate accumulated stale history. This prevents unbounded token
   *    growth in models with very large context windows where the limit would never fire.
   */
  shouldCompress(messages: Message[], estimatedTokens: number, contextLimit: number): boolean {
    const hasEnoughMessages = messages.length > PROTECT_HEAD + PROTECT_TAIL + 2;
    if (!hasEnoughMessages) return false;

    // Original: approaching model context limit
    const threshold = contextLimit * this.thresholdRatio;
    if (estimatedTokens > threshold) return true;

    // Economic: cap token spend within a single skill session.
    // Since skill switches create new sessions (shedding old history), a session
    // reaching 25K tokens / 20 messages indicates accumulated practice turns
    // worth compressing. Each trigger costs 1 summarizer call, but compression
    // reduces message count to ~12, preventing re-triggers for several more turns.
    const ECONOMIC_TOKEN_CEILING = 25_000;
    const ECONOMIC_MESSAGE_FLOOR = 20;
    if (estimatedTokens > ECONOMIC_TOKEN_CEILING && messages.length > ECONOMIC_MESSAGE_FLOOR) return true;

    return false;
  }

  /**
   * @inheritdoc
   */
  async compress(messages: Message[], _contextLimit: number): Promise<Message[]> {
    if (messages.length <= PROTECT_HEAD + PROTECT_TAIL) return messages;

    const head = messages.slice(0, PROTECT_HEAD);
    const tail = messages.slice(-PROTECT_TAIL);
    const middle = messages.slice(PROTECT_HEAD, messages.length - PROTECT_TAIL);

    if (middle.length === 0) return messages;

    // Constrain extraneous output from historical tools before submitting for summarization.
    const trimmed = middle.map(m => {
      if (m.role === 'tool' && m.content && m.content.length > MAX_TOOL_RESULT_CHARS) {
        return {
          ...m,
          content: m.content.slice(0, MAX_TOOL_RESULT_CHARS) + '\n... [truncated]',
        };
      }
      return m;
    });

    const summaryText = await this.generateSummary(trimmed);

    const summaryMessage: Message = {
      role: 'user',
      content: `[Previous conversation summary]\n\n${summaryText}\n\n[End of summary — conversation continues below]`,
    };

    const compressed = [...head, summaryMessage, ...tail];
    agentLogger.info({
      msg: 'context_compressed',
      originalMessages: messages.length,
      compressedMessages: compressed.length,
      middleCompressed: middle.length,
    });

    return compressed;
  }

  /**
   * Formulates a comprehensive semantic summary via the primary LLM interface.
   *
   * @param messages - The trimmed segment of conversation isolated for summarization.
   * @returns The structural summary as generated by the provider.
   */
  private async generateSummary(messages: Message[]): Promise<string> {
    const conversationText = messages
      .map(m => {
        const role = m.role === 'assistant' ? 'Assistant' : m.role === 'user' ? 'User' : `Tool(${m.toolName || 'unknown'})`;
        const content = m.content || (m.toolCalls ? `[called: ${m.toolCalls.map(t => t.name).join(', ')}]` : '[no content]');
        return `${role}: ${content}`;
      })
      .join('\n\n');

    try {
      const response = await this.provider.chat(
        [
          { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
          { role: 'user', content: `Summarise this conversation segment:\n\n${conversationText}` },
        ],
        [],
        this.config,
      );

      return response.content || '[Summary generation failed — no content returned]';
    } catch (err) {
      agentLogger.error({ msg: 'compression_summary_failed', error: (err as Error).message });
      return this.fallbackSummary(messages);
    }
  }

  /**
   * Synchronous, localized summarization bypass triggered if the primary LLM
   * encounters network instability.
   *
   * @param messages - The trimmed conversation sequence.
   * @returns A rudimentary line-based summary of core topics.
   */
  private fallbackSummary(messages: Message[]): string {
    const userMessages = messages
      .filter(m => m.role === 'user' && m.content)
      .map(m => m.content!);
    const assistantMessages = messages
      .filter(m => m.role === 'assistant' && m.content)
      .map(m => m.content!);

    const lines: string[] = ['[Fallback summary — LLM call failed]'];

    if (userMessages.length > 0) {
      lines.push(`**User topics**: ${userMessages.slice(0, 3).map(m => m.slice(0, 100)).join('; ')}`);
    }
    if (assistantMessages.length > 0) {
      lines.push(`**Assistant responses**: ${assistantMessages.length} messages`);
    }

    const toolNames = [...new Set(messages.filter(m => m.toolName).map(m => m.toolName!))];
    if (toolNames.length > 0) {
      lines.push(`**Tools used**: ${toolNames.join(', ')}`);
    }

    return lines.join('\n');
  }
}

const CJK_RANGE = /[\u2E80-\u9FFF\uF900-\uFAFF\uFE30-\uFE4F]/g;
const TOOL_SCHEMA_OVERHEAD_TOKENS = 200;

/**
 * Executes a high-performance heuristic calculation identifying the total expected
 * tokenizer sum necessary for context ingestion.
 *
 * Utilizes character mappings and accounts intrinsically for CJK language densities.
 * Strictly deployed for thresholds, not suitable for direct billing analytics.
 *
 * @param messages - The entire message chain to evaluate.
 * @param toolCount - The count of tool schema JSONs exposed in this request.
 * @returns The estimated token summation limit.
 */
export function estimateTokens(messages: Message[], toolCount: number = 0): number {
  let tokens = 0;
  for (const m of messages) {
    if (m.content) tokens += estimateStringTokens(m.content);
    if (m.toolCalls) tokens += estimateStringTokens(JSON.stringify(m.toolCalls));
  }
  tokens += toolCount * TOOL_SCHEMA_OVERHEAD_TOKENS;
  return Math.ceil(tokens);
}

/**
 * Calculates raw token projections for isolated string primitives based on encoding formats.
 *
 * @param text - The raw text literal to process.
 * @returns Projected integer mapping.
 */
function estimateStringTokens(text: string): number {
  const cjkMatches = text.match(CJK_RANGE);
  const cjkCount = cjkMatches ? cjkMatches.length : 0;
  const nonCjkCount = text.length - cjkCount;
  return (cjkCount / 1.5) + (nonCjkCount / 4);
}
