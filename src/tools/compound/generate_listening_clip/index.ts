// tools/compound/generate_listening_clip/index.ts
//
// Compound tool for listening-shadowing State A (Prepare & Deliver) and State E
// (Continue). Replaces ~50 lines of SKILL.md prose around §2.2 credit gating
// + §2.3 generation + State A delivery.
//
// Internal steps:
//   1. recent_practice — fetch session history + dedup hashes
//   2. apply_credit_gating — compute next tier + length (skill-spec'd constants)
//   3. llm_subroutine — generate a fresh sentence at the chosen length/tier,
//      targeting the LLM-picked weakness, with retry on prompt_hash collision
//   4. tts — render 100%-speed audio
//
// LLM responsibilities AFTER this returns:
//   - send tg_msg type="render" with url=audio_path + spoiler-wrapped reference
//   - on continue (State E), pass the previous tier/length through current_*

import { z } from 'zod';
import { registerCompoundTool, logToolSubcall } from '../sub.js';
import { dispatch } from '../../registry.js';
import { getDatabase } from '../../../storage/study/db.js';
import { recentPractice } from '../../../storage/study/practice.js';
import { llmSubroutine } from '../../../lib/llmSubroutine.js';
import { computePromptHash } from '../../../lib/promptHash.js';
import {
  applyCreditGating,
  LISTENING_TIER_TABLE,
  SHADOWING_THRESHOLDS,
  type CreditGatingOutput,
  type TierName,
} from '../../../lib/creditGating.js';
import type { ToolContext } from '../../../agent/types.js';

const SentenceSchema = z.object({ sentence: z.string().min(1) });

const DEFAULT_VOICE = 'en-US-AriaNeural';
const DEFAULT_INITIAL_TIER: TierName = 'beginner';
const MAX_DEDUP_RETRIES = 3;

interface PracticeRow {
  accuracy: number | null;
  completed: number;
  parent_sample_id?: number | null;
  prompt?: string;
  metadata?: unknown;
}

registerCompoundTool({
  name: 'generate_listening_clip',
  timeoutMs: 60_000,
  description:
    'Listening-shadowing State A/E pipeline. Fetches recent practice, applies credit gating (§2.2 logic, server-computed), generates a fresh sentence at the chosen tier/length targeting a weakness, and renders TTS at 100% speed. Use this instead of orchestrating recent_practice + sentence generation + tts manually. Returns {prompt, audio_path, prompt_hash, tier, clip_words, decision}. Send the audio via tg_msg type="render" with url=audio_path; embed the prompt as a spoiler.',
  parameters: {
    type: 'object',
    properties: {
      session_id: {
        type: 'string',
        description: 'Session id, e.g. tg:5496437870.',
      },
      target_weakness: {
        type: 'string',
        description: 'Subcap key from coach_context the LLM chose this round, e.g. "listening.connected_speech".',
      },
      current_tier: {
        type: 'string',
        description: 'Tier for the LAST persisted round (or initial tier from MEMORY.md on the first round). One of: "beginner" | "intermediate" | "advanced". Default "beginner".',
      },
      current_length: {
        type: 'integer',
        description: 'Word count of the LAST persisted clip (or tier-min on first round). Drives credit-based length deltas.',
      },
      voice: {
        type: 'string',
        description: 'TTS voice. Default: en-US-AriaNeural. Must be one of the en-* voices for shadowing.',
      },
      register_hint: {
        type: 'string',
        description: 'Optional hint for register variety: "monologue" or "dialogue". Pick the opposite of recent rounds to avoid repetition.',
      },
    },
    required: ['session_id', 'target_weakness'],
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<string> {
    const sessionId = String(args.session_id);
    const targetWeakness = String(args.target_weakness);
    const currentTier = normalizeTier(String(args.current_tier || DEFAULT_INITIAL_TIER));
    const currentLength = Number(args.current_length || LISTENING_TIER_TABLE[currentTier].min);
    const voice = String(args.voice || DEFAULT_VOICE);
    const registerHint = String(args.register_hint || 'monologue');

    const subCtx = { parent: 'generate_listening_clip', sessionId };

    // Step 1: fetch recent practice for this session + skill.
    const db = getDatabase('study');
    const recent = await logToolSubcall(
      subCtx,
      'persist:recent_practice',
      { skill_type: 'listening.shadowing', limit: 20 },
      async () => recentPractice(db, {
        action: 'recent_practice',
        scope: 'session',
        session_id: sessionId,
        skill_type: 'listening.shadowing',
        limit: 20,
        include_abandoned: 1,
      }),
    );

    const recentObj = recent as {
      ok: boolean;
      rows: PracticeRow[];
      recent_prompt_hashes: string[];
    };
    if (!recentObj?.ok) {
      return JSON.stringify({ ok: false, step: 'recent_practice', error: 'recentPractice returned non-ok' });
    }

    // Step 2: credit gating.
    let decision = applyCreditGating({
      rows: recentObj.rows.map(r => ({
        accuracy: r.accuracy,
        completed: r.completed,
        parent_sample_id: r.parent_sample_id ?? null,
      })),
      thresholds: SHADOWING_THRESHOLDS,
      tier_table: LISTENING_TIER_TABLE,
      current_tier: currentTier,
      current_length: currentLength,
    });

    // Explicit "too_hard" tap bypasses STREAK for an immediate single-notch demotion.
    // The button is a direct user signal ("I haven't even tried, this looks too hard") and
    // shouldn't wait for 3-in-a-row to take effect.
    let demotionReason: 'streak' | 'too_hard_tap' = 'streak';
    const newest = recentObj.rows[0];
    if (newest && isExplicitTooHardAbandon(newest)) {
      decision = forceSingleNotchDemote(currentTier, currentLength, decision);
      demotionReason = 'too_hard_tap';
    }

    const nextTier = decision.next_tier;
    const nextLength = decision.next_length;
    const dedupHashSet = new Set(recentObj.recent_prompt_hashes);

    // Step 3: generate a sentence (with retry on dedup collision).
    let sentence = '';
    let promptHash = '';
    let attempt = 0;
    let lastReason = '';
    for (; attempt < MAX_DEDUP_RETRIES; attempt++) {
      const gen = await logToolSubcall(
        subCtx,
        'llm_subroutine:sentence',
        { tier: nextTier, length: nextLength, weakness: targetWeakness, attempt },
        () => llmSubroutine({
          config: context.config,
          sessionId,
          parentTool: 'generate_listening_clip',
          outputSchema: SentenceSchema,
          systemPrompt: buildSentenceSystemPrompt(nextTier, nextLength, targetWeakness, registerHint),
          userPrompt: buildSentenceUserPrompt(recentObj.rows.slice(0, 5), attempt > 0 ? lastReason : ''),
        }),
      );

      sentence = gen.sentence.trim();
      promptHash = computePromptHash(sentence);
      if (!dedupHashSet.has(promptHash)) break;
      lastReason = `Previous attempt "${sentence}" collided with a recent prompt_hash. Generate a genuinely different sentence.`;
    }

    if (attempt === MAX_DEDUP_RETRIES && dedupHashSet.has(promptHash)) {
      return JSON.stringify({
        ok: false,
        step: 'dedup',
        error: `Could not generate a non-colliding sentence after ${MAX_DEDUP_RETRIES} attempts`,
      });
    }

    // Step 4: render TTS at 100% speed.
    const ttsResult = await logToolSubcall(
      subCtx,
      'tts:render',
      { voice, words: sentence.split(/\s+/).length },
      () => dispatch('tts', { text: sentence, voice }, context),
    );

    if (ttsResult.isError) {
      return JSON.stringify({ ok: false, step: 'tts', error: ttsResult.content });
    }

    let ttsParsed: { success?: boolean; filePath?: string; durationSec?: number; error?: string };
    try {
      ttsParsed = JSON.parse(ttsResult.content);
    } catch (err) {
      return JSON.stringify({ ok: false, step: 'tts_parse', error: (err as Error).message });
    }
    if (!ttsParsed.success || !ttsParsed.filePath) {
      return JSON.stringify({ ok: false, step: 'tts', error: ttsParsed.error || 'tts returned success=false' });
    }

    return JSON.stringify({
      ok: true,
      prompt: sentence,
      prompt_hash: promptHash,
      audio_path: ttsParsed.filePath,
      audio_duration_sec: ttsParsed.durationSec,
      tier: nextTier,
      clip_words: nextLength,
      target_weakness: targetWeakness,
      decision: {
        promotion_credit: decision.promotion_credit,
        demotion_credit: decision.demotion_credit,
        action: decision.action,
        reason: demotionReason,
      },
      next_step_hint:
        'Send tg_msg type="render" with url=audio_path, text describing the drill + the reference passage as a Telegram spoiler (||...||), and buttons [["🐢 慢速播放|shadow_slow","😵 太难了，降级|shadow_hard"]]. Cache prompt + prompt_hash + audio_path + tier + clip_words in conversation context — assess_listening_fluency needs them when the user records.',
    });
  },
});

const TIER_ORDER: TierName[] = ['beginner', 'intermediate', 'advanced'];

function isExplicitTooHardAbandon(row: PracticeRow): boolean {
  if (row.completed !== 0) return false;
  const meta = parseMetadata(row.metadata);
  return meta?.abandoned_reason === 'too_hard';
}

function parseMetadata(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) as Record<string, unknown>; } catch { return null; }
  }
  return null;
}

function forceSingleNotchDemote(
  current_tier: TierName,
  current_length: number,
  decision: CreditGatingOutput,
): CreditGatingOutput {
  const bounds = LISTENING_TIER_TABLE[current_tier];
  const tierIdx = TIER_ORDER.indexOf(current_tier);
  if (current_length > bounds.min) {
    return { ...decision, action: 'length_down', next_tier: current_tier, next_length: current_length - 1 };
  }
  if (tierIdx > 0) {
    const prevTier = TIER_ORDER[tierIdx - 1];
    return {
      ...decision,
      action: 'demote_tier',
      next_tier: prevTier,
      next_length: Math.max(current_length - 1, LISTENING_TIER_TABLE[prevTier].min),
    };
  }
  // At beginner floor — hold (can't demote further).
  return decision;
}

function normalizeTier(t: string): TierName {
  const v = t.toLowerCase();
  if (v === 'intermediate') return 'intermediate';
  if (v === 'advanced') return 'advanced';
  return 'beginner';
}

function buildSentenceSystemPrompt(
  tier: TierName,
  length: number,
  weakness: string,
  register: string,
): string {
  const tierDesc =
    tier === 'beginner'
      ? 'A1-A2 level: high-frequency vocabulary, simple subject-verb-object, no idioms or reductions'
      : tier === 'intermediate'
      ? 'B1 level: everyday topics, basic linking like "gonna" / "wanna" allowed, light connected speech'
      : 'B2+ level: natural reductions (shoulda, whatcha), elision, longer dependent clauses';

  const weaknessFocus =
    weakness === 'listening.connected_speech'
      ? 'The sentence MUST contain at least one explicit linking opportunity (consonant→vowel, identical-consonant elision, or weak-form schwa like "to" /tə/, "and" /ən/).'
      : weakness === 'listening.detail_accuracy'
      ? 'The sentence MUST contain a small grammatical detail learners commonly miss: a third-person -s, a plural -s, an article, or a function word like "every" / "any".'
      : weakness === 'listening.function_word_miss'
      ? 'The sentence MUST contain at least one unstressed function word (preposition, auxiliary, determiner) at a non-prominent position.'
      : `Target this learner weakness: ${weakness}. Pick the linguistic feature most associated with the weakness key.`;

  return [
    'You generate ONE sentence for a listening-shadowing drill. The learner will listen to a TTS rendering and try to repeat with native-like rhythm.',
    `Constraints:`,
    `- Exactly ${length} words (count words separated by whitespace; contractions like "I'm" = 1 word; ignore punctuation in the count).`,
    `- Tier: ${tier} — ${tierDesc}.`,
    `- ${weaknessFocus}`,
    `- Register: ${register}.`,
    `- Topic: everyday — work, hobbies, daily routine. Avoid news / politics / IELTS-test-y topics.`,
    `- Concrete and grounded, no abstract philosophical claims.`,
    `Output JSON: { "sentence": "..." }.`,
  ].join('\n');
}

function buildSentenceUserPrompt(
  recentRows: PracticeRow[],
  collisionNote: string,
): string {
  const recentPrompts = recentRows
    .map(r => r.prompt || '')
    .filter(Boolean)
    .slice(0, 5);
  const sections: string[] = [];
  if (recentPrompts.length > 0) {
    sections.push(`Recent sentences used (avoid same theme/structure):\n${recentPrompts.map(p => `- ${p}`).join('\n')}`);
  } else {
    sections.push('No recent sentences in this session yet — feel free to pick any everyday theme.');
  }
  if (collisionNote) sections.push(collisionNote);
  return sections.join('\n\n');
}
