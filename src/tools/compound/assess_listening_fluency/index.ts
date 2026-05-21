// tools/compound/assess_listening_fluency/index.ts
//
// Compound tool for listening-shadowing State C (Evaluate).
//
// Contract: voice in → pron_assess → normalize → persist row →
// (if pass=false) generate coaching audio → structured result out.
// Wraps four previously-LLM-orchestrated steps so they cannot be skipped.
// History:
//   - v1 folded pron_assess + persist (hid the original "LLM skipped assess" regression).
//   - v2 also folds coaching-audio generation: pass=false used to be 3 LLM
//     decision-steps (assess → coaching → tg_msg) and the LLM dropped the
//     final tg_msg after coaching returned. Now pass=false is one tool then
//     one tg_msg, mirroring the pass=true path.
//
// LLM responsibilities AFTER this returns:
//   - write Anya-voice feedback referencing scores + weak_words
//   - render via tg_msg type="render" (use coaching_audio_path as url when pass=false)

import { registerCompoundTool, logToolSubcall } from '../sub.js';
import { dispatch } from '../../registry.js';
import { getDatabase } from '../../../storage/study/db.js';
import { logPractice } from '../../../storage/study/practice.js';
import {
  normalizeFluencyResult,
  type AzurePronAssessOutput,
} from '../../../lib/pronAssessNormalize.js';
import { computePromptHash } from '../../../lib/promptHash.js';
import type { ToolContext } from '../../../agent/types.js';

const PASS_THRESHOLD = 0.85;     // fluency ≥ 85
const ERROR_KEY_LISTENING = 'connected_speech_breakdown';

registerCompoundTool({
  name: 'assess_listening_fluency',
  // pron_assess up to 60s + persist + a buffer; the registry default of 30s
  // would time out on cold Azure regions.
  timeoutMs: 90_000,
  description:
    'Listening-shadowing State C/D pipeline. Runs Azure pron_assess on the user voice, normalizes fluency/accuracy/completeness/prosody, persists the practice row, and (when pass=false) ALSO generates the slow-rate coaching audio in the same call. Returns scores, weak_words, sample_id, pass (fluency ≥ 85), and coaching_audio_path (non-null on fail). Call immediately when the user sends a voice message during listening-shadowing. The LLM must NOT call pron_assess, persist, or generate_fluency_coaching_audio directly — all folded in here.',
  parameters: {
    type: 'object',
    properties: {
      user_audio_path: {
        type: 'string',
        description: 'Absolute path to the user voice recording. Extract from voice message metadata [audio_path: ...].',
      },
      reference_prompt: {
        type: 'string',
        description: 'The English passage the user was meant to shadow (original-speed TTS reference text).',
      },
      original_audio_path: {
        type: 'string',
        description: 'Absolute path to the ORIGINAL-speed TTS audio (never the -10% slow version). Stored as audio_path on the persisted row.',
      },
      session_id: {
        type: 'string',
        description: 'Session id, e.g. tg:5496437870. Auto-injected from agent context.',
      },
      target_weakness: {
        type: 'string',
        description: 'Subcap key the LLM chose to probe this round, e.g. "listening.connected_speech".',
      },
      tier: {
        type: 'string',
        description: 'Difficulty tier this round: "beginner" | "intermediate" | "advanced".',
      },
      clip_words: {
        type: 'integer',
        description: 'Word count of the reference passage.',
      },
      button_taps: {
        type: 'string',
        description: 'JSON array of exact button labels tapped this round, e.g. ["🐢 慢速播放"]. Empty array if no buttons.',
      },
      voice: {
        type: 'string',
        description: 'TTS voice used for the reference clip (e.g. en-US-AriaNeural). Needed when pass=false so the coaching audio matches the original voice for continuity.',
      },
    },
    required: ['user_audio_path', 'reference_prompt', 'original_audio_path'],
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<string> {
    const sessionId = String(args.session_id || context.sessionKey || '');
    const userAudio = String(args.user_audio_path);
    const reference = String(args.reference_prompt);
    const originalAudio = String(args.original_audio_path);
    const targetWeakness = String(args.target_weakness || 'listening.connected_speech');
    const tier = String(args.tier || 'beginner');
    const clipWords = Number(args.clip_words || reference.split(/\s+/).length);
    const voice = String(args.voice || 'en-US-AriaNeural');
    let buttonTaps: string[] = [];
    try {
      const parsed = args.button_taps ? JSON.parse(String(args.button_taps)) : [];
      if (Array.isArray(parsed)) buttonTaps = parsed.map(String);
    } catch { /* ignore malformed */ }

    const subCtx = { parent: 'assess_listening_fluency', sessionId };

    // Step 1: pron_assess via the existing atomic tool. We go through dispatch
    // (not a direct fn import) so logging/timeouts/usage tracking are preserved.
    const pronResult = await logToolSubcall(
      subCtx,
      'pron_assess',
      { audio_path: userAudio, ref_len: reference.length },
      () => dispatch('pron_assess', { audio_path: userAudio, reference_text: reference }, context),
    );

    if (pronResult.isError) {
      return JSON.stringify({
        ok: false,
        step: 'pron_assess',
        error: pronResult.content,
        hint: 'Tell user assessment was unavailable; offer shadow_next. Do NOT persist a fake fluency score.',
      });
    }

    let azure: AzurePronAssessOutput;
    try {
      azure = JSON.parse(pronResult.content);
    } catch (err) {
      return JSON.stringify({
        ok: false,
        step: 'pron_assess_parse',
        error: `pron_assess returned non-JSON: ${(err as Error).message}`,
        raw: pronResult.content.slice(0, 300),
      });
    }

    const normalized = normalizeFluencyResult(azure);
    const pass = normalized.accuracy >= PASS_THRESHOLD;
    const promptHash = computePromptHash(reference);

    // Step 2: build persist payload.
    // Weak words become connected_speech_breakdown errors (up to 3, the most
    // actionable). Subcap score on canonical 0-10 scale.
    const errorsList = normalized.weak_words.slice(0, 3).map(w => ({
      key: ERROR_KEY_LISTENING,
      category: 'listening',
      severity: normalized.accuracy < 0.55 ? 'high' : 'medium',
      original: w,
      correction: w,
      note: `Word "${w}" scored below 60 in pron_assess; rhythm or linking broke here.`,
    }));

    const subcaps = [
      {
        key: 'listening.connected_speech',
        value: Math.round(normalized.accuracy * 100) / 10, // 0..10
        evidence: `Fluency ${normalized.scores.fluency}/100; ${
          normalized.weak_words.length
            ? `weak words: ${normalized.weak_words.join(', ')}`
            : 'no weak words flagged'
        }.`,
      },
    ];

    const metadata: Record<string, unknown> = {
      tier,
      clip_words: clipWords,
      target_weakness: targetWeakness,
      band_pronunciation: normalized.band_pronunciation,
      raw_scores: normalized.scores,
    };
    if (buttonTaps.length > 0) metadata.button_taps = buttonTaps;

    // Step 3: persist row. Direct logPractice call (not via dispatch) — the
    // payload is fully built, no need for the persist tool's argument
    // re-shaping.
    const db = getDatabase('study');
    const persistOutcome = await logToolSubcall(
      subCtx,
      'persist:practice',
      { skill_type: 'listening.shadowing', accuracy: normalized.accuracy, prompt_hash: promptHash },
      async () => logPractice(db, {
        skill_type: 'listening.shadowing',
        session_id: sessionId,
        prompt: reference,
        prompt_hash: promptHash,
        response: normalized.recognized_text,
        accuracy: normalized.accuracy,
        raw_score: Math.round(normalized.scores.fluency),
        max_score: 100,
        feedback:
          `Fluency ${normalized.scores.fluency}, Accuracy ${normalized.scores.accuracy}, ` +
          `Completeness ${normalized.scores.completeness}, Prosody ${normalized.scores.prosody}. ` +
          `Weak words: ${normalized.weak_words.join(', ') || 'none'}.`,
        audio_path: originalAudio,
        section: 'listening',
        minutes: 1,
        mode: 'study',
        completed: 1,
        band_overall: Math.round((normalized.band_pronunciation / 10) * 10) / 10,
        metadata: JSON.stringify(metadata),
        errors: JSON.stringify(errorsList),
        subcap_scores: JSON.stringify(subcaps),
      }),
    );

    const persistObj = persistOutcome as { ok?: boolean; sample_id?: number; error?: string };
    if (!persistObj.ok) {
      return JSON.stringify({
        ok: false,
        step: 'persist',
        error: persistObj.error || 'logPractice returned non-ok',
      });
    }

    // Step 4 (pass=false only): generate slow coaching audio inline so the LLM
    // only has one tg_msg call left. Previously this was a separate LLM-driven
    // tool call which the LLM could (and did) drop, leaving the user with no
    // reply at all. Degrade gracefully: if coaching generation fails, surface
    // null and let the LLM send a text-only feedback.
    let coachingAudioPath: string | null = null;
    let coachingChunks: string[] = [];
    if (!pass && normalized.weak_words.length > 0) {
      const chunks = normalized.weak_words.slice(0, 2);
      const coachingResult = await logToolSubcall(
        subCtx,
        'generate_fluency_coaching_audio',
        { chunks_count: chunks.length, voice },
        () => dispatch(
          'generate_fluency_coaching_audio',
          {
            chunks: JSON.stringify(chunks),
            reference_passage: reference,
            voice,
          },
          context,
        ),
      );
      if (!coachingResult.isError) {
        try {
          const parsed = JSON.parse(coachingResult.content) as {
            ok?: boolean;
            audio_path?: string;
            chunks_used?: string[];
          };
          if (parsed.ok && parsed.audio_path) {
            coachingAudioPath = parsed.audio_path;
            coachingChunks = parsed.chunks_used ?? chunks;
          }
        } catch {
          /* coaching audio is best-effort; non-JSON falls through to null */
        }
      }
    }

    // Step 5: structured result for the LLM to compose feedback from.
    return JSON.stringify({
      ok: true,
      sample_id: persistObj.sample_id,
      pass,
      scores: {
        // 准确度 / 流利度 / 完整度 / 韵律感 — SKILL.md 强制要求展示这 4 个
        accuracy: normalized.scores.accuracy,
        fluency: normalized.scores.fluency,
        completeness: normalized.scores.completeness,
        prosody: normalized.scores.prosody,
        pronunciation: normalized.scores.pronunciation,
      },
      // For State D credit-gating math (0-1 ratio).
      accuracy_ratio: normalized.accuracy,
      weak_words: normalized.weak_words,
      recognized_text: normalized.recognized_text,
      reference_prompt: reference,
      coaching_audio_path: coachingAudioPath,
      coaching_chunks: coachingChunks,
      next_step: pass
        ? 'feedback_with_buttons'
        : 'coaching_audio_then_feedback',
      next_step_hint: pass
        ? 'Send tg_msg type="render" with feedback text + buttons [["🔄 再来一句|shadow_next","🧭 练习其他|nav:main"]]. If accuracy_ratio === 1.0 add react:"🔥".'
        : coachingAudioPath
          ? 'Send ONE tg_msg type="render" with url=coaching_audio_path + feedback text, NO buttons. Mention the coaching_chunks in the feedback so the user knows what to focus on. The next voice message triggers State F.'
          : 'Coaching audio unavailable (assessment-only). Send ONE tg_msg type="render" with feedback text only (no url, no buttons). Ask the user to listen to the original audio again and retry.',
    });
  },
});
