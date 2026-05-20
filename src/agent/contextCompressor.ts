// agent/contextCompressor.ts — context window compression

import type { Message, LLMProvider } from './types.js';
import type { AnyaConfig } from '../config/defaults.js';
import { agentLogger } from '../lib/logger.js';

export interface ContextEngine {
  shouldCompress(messages: Message[], estimatedTokens: number, contextLimit: number): boolean;
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

export class ContextCompressor implements ContextEngine {
  private config: AnyaConfig;
  private provider: LLMProvider;
  private thresholdRatio: number;

  constructor(config: AnyaConfig, provider: LLMProvider) {
    this.config = config;
    this.provider = provider;
    this.thresholdRatio = config.provider.compress_threshold || 0.75;
  }

  shouldCompress(messages: Message[], estimatedTokens: number, contextLimit: number): boolean {
    const hasEnoughMessages = messages.length > PROTECT_HEAD + PROTECT_TAIL + 2;
    if (!hasEnoughMessages) return false;

    const threshold = contextLimit * this.thresholdRatio;
    if (estimatedTokens > threshold) return true;

    const ECONOMIC_TOKEN_CEILING = 25_000;
    const ECONOMIC_MESSAGE_FLOOR = 20;
    if (estimatedTokens > ECONOMIC_TOKEN_CEILING && messages.length > ECONOMIC_MESSAGE_FLOOR) return true;

    return false;
  }

  async compress(messages: Message[], _contextLimit: number): Promise<Message[]> {
    if (messages.length <= PROTECT_HEAD + PROTECT_TAIL) return messages;

    const head = messages.slice(0, PROTECT_HEAD);
    const tail = messages.slice(-PROTECT_TAIL);
    const middle = messages.slice(PROTECT_HEAD, messages.length - PROTECT_TAIL);

    if (middle.length === 0) return messages;

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

// Heuristic only — not suitable for billing.
export function estimateTokens(messages: Message[], toolCount: number = 0): number {
  let tokens = 0;
  for (const m of messages) {
    if (m.content) tokens += estimateStringTokens(m.content);
    if (m.toolCalls) tokens += estimateStringTokens(JSON.stringify(m.toolCalls));
  }
  tokens += toolCount * TOOL_SCHEMA_OVERHEAD_TOKENS;
  return Math.ceil(tokens);
}

function estimateStringTokens(text: string): number {
  const cjkMatches = text.match(CJK_RANGE);
  const cjkCount = cjkMatches ? cjkMatches.length : 0;
  const nonCjkCount = text.length - cjkCount;
  return (cjkCount / 1.5) + (nonCjkCount / 4);
}
