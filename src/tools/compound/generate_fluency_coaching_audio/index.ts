// tools/compound/generate_fluency_coaching_audio/index.ts
//
// Compound tool for listening-shadowing State C low-score branch.
//
// Contract: given 1-2 chunks the user stumbled on, generate a slow + clear
// coaching audio (segments mode, -25% rate, with break gaps) so the learner
// can re-listen before re-recording.
//
// Internal steps:
//   1. llmSubroutine — generate a tight example sentence per chunk (≤8 words)
//   2. assemble segments JSON per SKILL.md §3 State C low-score spec
//   3. dispatch tts to render
//
// LLM responsibilities AFTER this returns:
//   - send tg_msg type="render" with url=audio_path + feedback text, no buttons

import { z } from 'zod';
import { registerCompoundTool, logToolSubcall } from '../sub.js';
import { dispatch } from '../../registry.js';
import { llmSubroutine } from '../../../lib/llmSubroutine.js';
import type { ToolContext } from '../../../agent/types.js';

const ExamplesSchema = z.object({
  examples: z.array(
    z.object({
      chunk: z.string(),
      sentence: z.string(),
    }),
  ),
});

const MAX_CHUNKS = 2;
const SLOW_RATE = '-25%';
const INTER_CHUNK_BREAK_MS = 1500;
const PHRASE_TO_EXAMPLE_BREAK_MS = 800;
const DEFAULT_VOICE = 'en-US-AriaNeural';

registerCompoundTool({
  name: 'generate_fluency_coaching_audio',
  // LLM subroutine (~5s) + tts segments render (~3s) + buffer.
  timeoutMs: 60_000,
  description:
    'Listening-shadowing State C low-score scaffold. Given 1-2 chunks the user stumbled on, builds a slow (-25%) coaching audio: each chunk plays in isolation, then in a short example sentence, separated by deliberate break gaps. Use only when assess_listening_fluency returned pass=false. Pass weak_words or specific chunks. Returns {audio_path, chunks_used} — send the audio via tg_msg type="render" with url=audio_path.',
  parameters: {
    type: 'object',
    properties: {
      chunks: {
        type: 'string',
        description: 'JSON array of 1-2 chunk strings to coach on, e.g. ["version of", "gonna"]. Capped at 2 even if more provided.',
      },
      reference_passage: {
        type: 'string',
        description: 'The original passage the user was shadowing — gives the LLM context to write thematically consistent examples.',
      },
      voice: {
        type: 'string',
        description: 'Voice name (must match the original passage voice for continuity). Default: en-US-AriaNeural.',
      },
    },
    required: ['chunks', 'reference_passage'],
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<string> {
    const sessionId = context.sessionId;
    const subCtx = { parent: 'generate_fluency_coaching_audio', sessionId };

    let chunks: string[] = [];
    try {
      const parsed = JSON.parse(String(args.chunks));
      if (Array.isArray(parsed)) chunks = parsed.map(String).filter(Boolean);
    } catch {
      return JSON.stringify({ ok: false, error: 'chunks must be valid JSON array of strings' });
    }
    chunks = chunks.slice(0, MAX_CHUNKS);
    if (chunks.length === 0) {
      return JSON.stringify({ ok: false, error: 'chunks must contain at least 1 item' });
    }

    const referencePassage = String(args.reference_passage || '');
    const voice = String(args.voice || DEFAULT_VOICE);

    // Step 1: LLM subroutine — example sentences for each chunk.
    const examplesResult = await logToolSubcall(
      subCtx,
      'llm_subroutine:coaching_examples',
      { chunks_count: chunks.length },
      () => llmSubroutine({
        config: context.config,
        sessionId,
        parentTool: 'generate_fluency_coaching_audio',
        outputSchema: ExamplesSchema,
        systemPrompt:
          'For each chunk the learner stumbled on while shadowing a passage, write ONE short example sentence (5-8 words) that uses the chunk naturally. ' +
          'Sentences must be everyday English, present tense, and thematically related to the reference passage if possible.\n\n' +
          'Output JSON: { "examples": [ { "chunk": "...", "sentence": "..." }, ... ] }\n' +
          'Preserve the chunk strings verbatim (same casing) so callers can match them.',
        userPrompt:
          `Reference passage:\n${referencePassage}\n\nChunks to coach:\n${chunks.map(c => `- ${c}`).join('\n')}`,
      }),
    );

    // Build a chunk→sentence map; fall back to the chunk itself if the LLM
    // missed one (defensive: don't fail the whole tool on a partial result).
    const exampleByChunk = new Map<string, string>();
    for (const ex of examplesResult.examples) {
      exampleByChunk.set(ex.chunk, ex.sentence);
    }
    const chunksUsed = chunks.map(c => ({
      chunk: c,
      sentence: exampleByChunk.get(c) || `${c}.`,
    }));

    // Step 2: assemble segments. Per SKILL.md §3 State C low-score:
    //   phrase → 800ms break → example sentence → (between chunks: 1500ms break)
    type Segment = { voice?: string; text?: string; rate?: string; break?: string };
    const segments: Segment[] = [];
    chunksUsed.forEach((cu, i) => {
      if (i > 0) segments.push({ break: `${INTER_CHUNK_BREAK_MS}ms` });
      segments.push({ voice, text: cu.chunk, rate: SLOW_RATE });
      segments.push({ break: `${PHRASE_TO_EXAMPLE_BREAK_MS}ms` });
      segments.push({ voice, text: cu.sentence, rate: SLOW_RATE });
    });

    // Step 3: render via the atomic tts tool.
    const ttsResult = await logToolSubcall(
      subCtx,
      'tts:segments',
      { segments_count: segments.length, voice },
      () => dispatch('tts', { segments: JSON.stringify(segments) }, context),
    );

    if (ttsResult.isError) {
      return JSON.stringify({
        ok: false,
        step: 'tts',
        error: ttsResult.content,
      });
    }

    let ttsParsed: { success?: boolean; filePath?: string; durationSec?: number; error?: string };
    try {
      ttsParsed = JSON.parse(ttsResult.content);
    } catch (err) {
      return JSON.stringify({
        ok: false,
        step: 'tts_parse',
        error: `tts returned non-JSON: ${(err as Error).message}`,
      });
    }

    if (!ttsParsed.success || !ttsParsed.filePath) {
      return JSON.stringify({
        ok: false,
        step: 'tts',
        error: ttsParsed.error || 'tts returned success=false without error message',
      });
    }

    return JSON.stringify({
      ok: true,
      audio_path: ttsParsed.filePath,
      duration_sec: ttsParsed.durationSec,
      chunks_used: chunksUsed,
      next_step_hint:
        'Send tg_msg type="render" with url=audio_path and feedback text (no buttons). ' +
        'Mention the specific chunks coached in the feedback so the user knows what to focus on.',
    });
  },
});
