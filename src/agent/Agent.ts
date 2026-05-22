// agent/Agent.ts — ReAct loop core

import type { Message, Adapter, MessageFile, LLMProvider } from './types.js';
import type { AnyaConfig } from '../config/defaults.js';
import { buildSystemPrompt } from './promptBuilder.js';
import { createProvider } from '../providers/index.js';
import { getToolSchemas, getAllTools, dispatch } from '../tools/registry.js';
import { getOrCreateSession, createSession, loadMessages, saveMessages, updateSessionTitle, getActiveSkill, setActiveSkill } from '../storage/state/sessions.js';
import { getSkill } from '../skills/loader.js';
import { agentLogger } from '../lib/logger.js';
import { trackLlm } from '../lib/usage.js';
import { truncateHistory, sanitizeHistory } from './history.js';
import { classifyApiError } from './errorClassifier.js';
import { ContextCompressor, estimateTokens } from './contextCompressor.js';

export interface ToolPolicy {
  allow?: string[];
  deny?: string[];
}

export interface RunOptions {
  sessionKey: string;
  sessionId?: string;
  newSession?: boolean;
  files?: MessageFile[];
  toolPolicy?: ToolPolicy;
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
    const { sessionKey, newSession, files, toolPolicy } = options;
    let { sessionId } = options;

    if (!sessionId) {
      sessionId = newSession
        ? await createSession(sessionKey)
        : await getOrCreateSession(sessionKey);
    }

    let history = loadMessages(sessionId);
    const maxHistory = this.config.provider.max_history_messages || 200;
    history = truncateHistory(history, maxHistory);
    history = trimOldToolResults(history);
    history = sanitizeHistory(history);

    const baseSystemPrompt = buildSystemPrompt(this.config);
    const activeSkillName = getActiveSkill(sessionId);
    let systemPrompt = baseSystemPrompt;
    if (activeSkillName) {
      const skill = getSkill(activeSkillName);
      if (skill) {
        systemPrompt = buildActiveSkillSystemPrompt(baseSystemPrompt, activeSkillName, skill.body);
      }
    }

    // Timestamp on user input (not system prompt) preserves cache hit rate across turns.
    const timestampedInput = `[${new Date().toISOString()}] ${input}`;

    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: timestampedInput, files },
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
    let totalToolCalls = 0;
    let tgSent = false;
    let compressionCount = 0;
    const MAX_COMPRESSIONS = 3;
    let lastRealTokenCount = 0;
    let firstLlmCall = true;

    for (let loop = 0; loop < maxLoops; loop++) {

      const tokenCount = lastRealTokenCount || estimateTokens(messages, getAllTools().length);
      if (compressor.shouldCompress(messages, tokenCount, contextLimit) && compressionCount < MAX_COMPRESSIONS) {
        compressionCount++;
        const compressed = await compressor.compress(messages, contextLimit);
        messages.length = 0;
        messages.push(...compressed);
        lastRealTokenCount = 0;
      }

      const toolSchemas = getToolSchemas(this.config, this.adapter.platform, toolPolicy);
      const model = this.config.provider.model;
      const provider = this.provider;

      let response;
      try {
        response = await provider.chat(messages, toolSchemas, this.config, { sessionId });

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

          if (toolCall.name === 'skill_view' && !toolCall.args.file && !result.isError) {
            const skillName = String(toolCall.args.name || '');
            const skill = getSkill(skillName);
            if (skill) {
              await setActiveSkill(sessionId, skillName);
              messages[0] = {
                role: 'system',
                content: buildActiveSkillSystemPrompt(buildSystemPrompt(this.config), skillName, skill.body),
              };
              // Body now lives in system prompt — avoid duplicating it in history.
              result.content = `[Skill "${skillName}" loaded — instructions are now in active context]`;
            }
          }

          let terminalRender = false;
          if (toolCall.name === 'tg_msg' && !result.isError) {
            try {
              const parsed = JSON.parse(result.content);
              if (parsed.ok && parsed.sent_content) {
                tgSent = true;
              }
              if (parsed.ok && parsed.terminal === true) {
                terminalRender = true;
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

          if (terminalRender) {
            // Skip the redundant "tools=0" round-trip — skill explicitly declared this
            // tg_msg as the last user-visible action of the turn. Persist what we have
            // (assistant tool calls + tool results) so the next turn loads valid history.
            const degraded = degradeForStorage(newMessages);
            await saveMessages(sessionId, degraded);

            return {
              content: response.content || '',
              sessionId,
              toolCallCount: totalToolCalls,
              tgSent,
            };
          }
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

const KEEP_RECENT_TOOL_RESULTS = 8;
const MAX_OLD_TOOL_CHARS = 200;

// Orphaned tool messages produced here are dropped later by sanitizeHistory.
function trimOldToolResults(history: Message[]): Message[] {
  let toolCount = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === 'tool') {
      toolCount++;
      if (toolCount > KEEP_RECENT_TOOL_RESULTS) {
        const content = history[i].content || '';
        if (content.length > MAX_OLD_TOOL_CHARS) {
          history[i] = {
            ...history[i],
            content: content.substring(0, MAX_OLD_TOOL_CHARS) + '\n[...truncated]',
          };
        }
      }
    } else if (history[i].role === 'assistant' && history[i].toolCalls && history[i].toolCalls!.length > 0) {
      if (toolCount > KEEP_RECENT_TOOL_RESULTS) {
        const toolCalls = history[i].toolCalls!;
        const toolNames = toolCalls.map(t => t.name).join(', ');

        // Preserve the text sent to the user via tg_msg so the LLM retains
        // conversational continuity (what it actually said) even after the
        // toolCalls structure is stripped. Without this, the LLM loses track
        // of the current placement test state and may emit bare text instead
        const parts: string[] = [`[Executed tools: ${toolNames}]`];
        for (const tc of toolCalls) {
          if (tc.name === 'tg_msg' && tc.args?.text) {
            const text = String(tc.args.text);
            // Keep up to 500 chars of the sent text — enough for the LLM to
            // refer back to specifics in long final reports (e.g. placement
            // scanner result) without bloating the prompt.
            const preview = text.length > 500 ? text.substring(0, 500) + '…' : text;
            parts.push(`[Sent to user: ${preview}]`);
          }
        }
        if (history[i].content) {
          parts.push(history[i].content!);
        }
        history[i] = {
          role: 'assistant',
          content: parts.join('\n'),
        };
      }
    }
  }
  return history;
}

function buildActiveSkillSystemPrompt(baseSystemPrompt: string, skillName: string, skillBody: string): string {
  return [
    baseSystemPrompt,
    `\n## Active Skill Instructions (${skillName})\n`,
    skillBody,
    `\n> Active skill "${skillName}" is already loaded above. Do not call \`skill_view\` for this SKILL.md again. Use \`skill_view\` with \`file\` only when the active skill explicitly references an attached file. Continue from the current workflow state.`,
  ].join('\n');
}
