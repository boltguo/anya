// agent/Agent.ts — ReAct loop core

import type { Message, Adapter, MessageFile, LLMProvider } from './types.js';
import type { AnyaConfig } from '../config/defaults.js';
import { buildSystemPrompt } from './promptBuilder.js';
import { createProvider } from '../providers/index.js';
import { getToolSchemas, dispatch } from '../tools/registry.js';
import { getOrCreateSession, createSession, loadMessages, saveMessages, updateSessionTitle } from '../storage/state/sessions.js';
import { agentLogger } from '../lib/logger.js';
import { trackLlm } from '../lib/usage.js';
import { truncateHistory, sanitizeHistory, compactCompletedPractice } from './history.js';
import { classifyApiError } from './errorClassifier.js';
import { ContextCompressor, estimateTokens } from './contextCompressor.js';

export interface ToolPolicy {
  allow?: string[];
  deny?: string[];
}

export interface TurnMetadata {
  trigger: 'text' | 'voice' | 'photo' | 'callback' | 'command' | 'poll' | 'cron';
  details?: Record<string, string | number | boolean>;
}

export interface RunOptions {
  sessionKey: string;
  sessionId?: string;
  newSession?: boolean;
  files?: MessageFile[];
  toolPolicy?: ToolPolicy;
  turnMeta?: TurnMetadata;
}

export interface RunResult {
  content: string;
  sessionId: string;
  toolCallCount: number;
  tgSent: boolean;
}

export class Agent {
  private config: AnyaConfig;
  private adapter: Adapter;
  private provider: LLMProvider;

  constructor(config: AnyaConfig, adapter: Adapter) {
    this.config = config;
    this.adapter = adapter;
    this.provider = createProvider(config);
  }

  async run(input: string, options: RunOptions): Promise<RunResult> {
    const { sessionKey, newSession, files, toolPolicy, turnMeta } = options;
    let { sessionId } = options;

    if (!sessionId) {
      sessionId = newSession
        ? await createSession(sessionKey)
        : await getOrCreateSession(sessionKey);
    }

    let history = loadMessages(sessionId);
    const maxHistory = this.config.provider.max_history_messages || 200;
    history = truncateHistory(history, maxHistory);
    history = compactCompletedPractice(history);
    history = sanitizeHistory(history);

    const systemPrompt = buildSystemPrompt(this.config) + buildTurnContextBlock(turnMeta);

    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: input, files },
    ];

    const newMessages: Message[] = [
      { role: 'user', content: input, files },
    ];

    if (history.length === 0) {
      const title = input.length > 50 ? input.substring(0, 50) + '...' : input;
      await updateSessionTitle(sessionId, title);
    }

    const maxLoops = this.config.provider.max_react_loops;
    const contextLimit = this.config.provider.context_window;
    const compressor = new ContextCompressor(this.config, this.provider);
    // Tool schemas are loop-invariant (depend on static config + platform + policy).
    const toolSchemas = getToolSchemas(this.config, this.adapter.platform, toolPolicy);
    let totalToolCalls = 0;
    let tgSent = false;
    let compressionCount = 0;
    const MAX_COMPRESSIONS = 3;
    let lastRealTokenCount = 0;
    let firstLlmCall = true;

    for (let loop = 0; loop < maxLoops; loop++) {

      const tokenCount = lastRealTokenCount || estimateTokens(messages, toolSchemas.length);
      if (compressor.shouldCompress(messages, tokenCount, contextLimit) && compressionCount < MAX_COMPRESSIONS) {
        compressionCount++;
        const compressed = await compressor.compress(messages, contextLimit);
        messages.length = 0;
        messages.push(...compressed);
        lastRealTokenCount = 0;
      }

      const model = this.config.provider.model;

      let response;
      try {
        response = await this.provider.chat(messages, toolSchemas, this.config, { sessionId });

        // Strip inline file data after first call to avoid re-uploading base64 in loops.
        if (firstLlmCall && files && files.length > 0) {
          firstLlmCall = false;
          for (const m of messages) {
            if (m.files) {
              m.content = `[📷 ${m.files.length} image(s) attached — already processed]\n${m.content || ''}`.trim();
              delete m.files;
            }
          }
        } else {
          firstLlmCall = false;
        }
      } catch (err) {
        const classified = classifyApiError(err);

        if (classified.shouldCompress && compressionCount < MAX_COMPRESSIONS) {
          compressionCount++;
          agentLogger.warn({ msg: 'context_overflow_recovery', loop, compressionCount });
          const compressed = await compressor.compress(messages, contextLimit);
          messages.length = 0;
          messages.push(...compressed);
          lastRealTokenCount = 0;
          continue;
        }
        throw err;
      }

      if (response.usage?.promptTokens) {
        lastRealTokenCount = response.usage.promptTokens;
      }

      const u = response.usage;
      const logEntry: Record<string, unknown> = {
        msg: 'llm_call',
        model,
        sessionId,
        loop,
        duration_ms: response.durationMs || 0,
      };

      if (u) {
        Object.assign(logEntry, {
          tokens: {
            in: u.promptTokens,
            out: u.completionTokens,
            cached: u.cachedTokens || 0,
            thoughts: u.thoughtsTokens || 0,
            total: u.totalTokens,
          },
        });
      }

      logEntry.tools = response.toolCalls?.length || 0;
      logEntry.hasContent = !!response.content;
      agentLogger.info(logEntry);

      if (u) {
        trackLlm(u.promptTokens || 0, u.completionTokens || 0, u.cachedTokens || 0, this.provider.name);
      }

      if (response.toolCalls && response.toolCalls.length > 0) {
        totalToolCalls += response.toolCalls.length;

        const assistantMsg: Message = {
          role: 'assistant',
          content: response.content || undefined,
          toolCalls: response.toolCalls,
          _rawParts: response.rawModelParts,
        };
        messages.push(assistantMsg);
        newMessages.push(assistantMsg);

        for (const toolCall of response.toolCalls) {
          if (this.config.ui.show_tool_calls && this.adapter.showToolCall) {
            this.adapter.showToolCall(toolCall.name, toolCall.args);
          }

          const result = await dispatch(toolCall.name, toolCall.args, {
            adapter: this.adapter,
            config: this.config,
            sessionId,
            sessionKey,
          });

          if (toolCall.name === 'tg_msg' && !result.isError) {
            try {
              const parsed = JSON.parse(result.content);
              if (parsed.ok && parsed.sent_content) {
                tgSent = true;
              }
            } catch { /* non-JSON result — don't set tgSent */ }
          }

          if (this.config.ui.show_tool_calls && this.adapter.showToolResult) {
            this.adapter.showToolResult(toolCall.name, result.content, result.isError);
          }

          const toolMsg: Message = {
            role: 'tool',
            content: result.content,
            toolCallId: toolCall.id,
            toolName: toolCall.name,
          };
          messages.push(toolMsg);
          newMessages.push(toolMsg);
        }

        continue;
      }

      const finalContent = response.content || '';

      const assistantMsg: Message = {
        role: 'assistant',
        content: finalContent,
        _rawParts: response.rawModelParts,
      };
      newMessages.push(assistantMsg);

      const degraded = degradeForStorage(newMessages);
      await saveMessages(sessionId, degraded);

      return {
        content: finalContent,
        sessionId,
        toolCallCount: totalToolCalls,
        tgSent,
      };
    }

    const fallbackMsg = 'Warning: Maximum loop count reached. Please try simplifying your request.';
    newMessages.push({ role: 'assistant', content: fallbackMsg });
    const degraded = degradeForStorage(newMessages);
    await saveMessages(sessionId, degraded);

    return {
      content: fallbackMsg,
      sessionId,
      toolCallCount: totalToolCalls,
      tgSent,
    };
  }
}

// Strip transient `files` so MB-scale base64 blobs don't bloat SQLite history.
function degradeForStorage(messages: Message[]): Message[] {
  return messages.map(msg => {
    if (msg.files && msg.files.length > 0) {
      const { files, ...rest } = msg;
      return {
        ...rest,
        content: `[📷 User sent ${files.length} image(s)]\n${msg.content || ''}`.trim(),
      };
    }
    return msg;
  });
}

// Per-turn context appended to the static system prompt. Keeps user.content
// pristine (just what the user actually said) while still giving the model the
// trigger source, audio path, vision summary, etc. Don't echo these to the user.
function buildTurnContextBlock(meta?: TurnMetadata): string {
  const ts = new Date().toISOString();
  const lines = [
    '\n\n## This Turn (system metadata, do not echo)',
    `- timestamp: ${ts}`,
  ];
  if (meta) {
    lines.push(`- trigger: ${meta.trigger}`);
    if (meta.details) {
      for (const [k, v] of Object.entries(meta.details)) {
        if (v === undefined || v === null || v === '') continue;
        lines.push(`- ${k}: ${v}`);
      }
    }
  } else {
    lines.push('- trigger: text');
  }
  return lines.join('\n');
}

