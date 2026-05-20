// tools/persist.ts — study.db unified writer (slim v3)
//
// Removed actions: skill_run_*, task_upsert, task_complete, due_tasks
// Removed params: scale_min/max, normalized_0_100, reliability, scaffolded,
//                 attempt_no, redo_count, ui_feedback, domain, source_url,
//                 image_path, load_score, duration_seconds, band_task/coherence/lexical/grammar/pronunciation,
//                 timezone, l1, preferred_tone, study_pattern, daily_minutes,
//                 strengths, weaknesses, plan, summary_text, skills_used,
//                 platform, entrypoint, samples_count, due_words_count,
//                 vocab_active_count, vocab_mature_count, total_minutes,
//                 active_days, sessions_count, weak_subcaps, top_errors
//
// Surviving actions:
//   write: practice, word_upsert, word_review, profile_upsert,
//          session_start, session_end, progress_snapshot, onboarding_done
//   read:  study_summary, coach_context, recent_practice, due_words,
//          word_lookup, progress_trend, learner_state_scores

import { register } from './registry.js';
import { getDatabase } from '../storage/study/db.js';
import { getConfig, persistConfig } from '../config/loader.js';
import type { ToolContext } from '../agent/types.js';

import { logPractice, recentPractice } from '../storage/study/practice.js';
import { upsertWords, reviewWord, dueWords, wordLookup } from '../storage/study/vocabulary.js';
import { studySummary, progressSnapshot, progressTrend, learnerStateScores } from '../storage/study/progress.js';
import { sessionStart, sessionEnd } from '../storage/study/session.js';
import { profileUpsert, coachContext } from '../storage/study/profile.js';

function markOnboardingDone(step: string): unknown {
  if (step !== 'profile' && step !== 'placement') {
    return { error: `Unknown onboarding step: ${step}. Use "profile" or "placement".` };
  }
  const cfg = getConfig();
  const field = step === 'profile' ? 'profile_done' : 'placement_done';
  cfg.onboarding[field] = true;
  persistConfig(cfg);
  return { ok: true, step, [field]: true };
}

const COACH_CONTEXT_CACHE_TTL_MS = 5 * 60 * 1000;
const coachContextCache = new Map<string, { data: unknown; ts: number }>();

register({
  name: 'persist',
  description: 'Typed gateway for English study.db. Default action="practice" writes practice evidence. Read actions: study_summary, coach_context, recent_practice, due_words, word_lookup, progress_trend, learner_state_scores. Write actions: word_upsert, word_review, profile_upsert, session_start, session_end, progress_snapshot, onboarding_done. Skills must use this instead of raw db calls for learner data.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'practice (default) | word_upsert | word_review | due_words | word_lookup | study_summary | coach_context | recent_practice | profile_upsert | session_start | session_end | progress_snapshot | progress_trend | learner_state_scores | onboarding_done',
      },
      step: { type: 'string', description: 'For onboarding_done: "profile" or "placement".' },

      // practice
      skill_type: { type: 'string', description: 'Practice skill identifier, e.g. listening.dictation, writing.essay, vocab.review.' },
      session_id: { type: 'string', description: 'Session key, e.g. tg:12345. Auto-injected from agent context.' },
      study_session_id: { type: 'integer', description: 'study_sessions row id. Auto-resolved from session_id if omitted.' },
      prompt: { type: 'string', description: 'Practice prompt. Auto-replaced with "[abandoned]" if completed=0 and prompt is empty.' },
      response: { type: 'string', description: 'User raw answer. Auto-replaced if completed=0 and empty.' },
      feedback: { type: 'string', description: 'Natural-language diagnostic paragraph. Auto-replaced if completed=0 and empty.' },
      accuracy: { type: 'number', description: '0.0-1.0 ratio.' },
      raw_score: { type: 'integer', description: 'Items correct.' },
      max_score: { type: 'integer', description: 'Items total.' },
      audio_path: { type: 'string', description: 'TTS audio path (listening skills).' },
      mode: { type: 'string', description: 'study | placement.' },
      completed: { type: 'integer', description: '1 finished, 0 abandoned. Always write — abandoned rows drive auto-demotion.' },
      section: { type: 'string', description: 'listening | speaking | reading | writing | vocab. Auto-inferred from skill_type.' },
      minutes: { type: 'integer', description: 'Approximate minutes.' },
      band_overall: { type: 'number', description: 'Overall band estimate. Sub-dimensions (task/coherence/lexical/grammar) go to subcap_scores as writing.task_achievement etc.' },
      parent_sample_id: { type: 'integer', description: 'For redo chains.' },
      assistance_level: { type: 'string', description: 'none | hint | outline | sos | redo.' },
      prompt_hash: { type: 'string', description: 'First 12 hex of sha1(normalized prompt).' },
      metadata: { type: 'string', description: 'JSON object for skill-owned extras (e.g. source_url, button_taps, replays).' },
      errors: { type: 'string', description: 'JSON array of {key, category, severity, original, correction, note}. Unknown keys are dropped and returned in unknown_error_keys.' },
      subcap_scores: { type: 'string', description: 'JSON array of {key, value, evidence}. All values on 0-10 scale.' },

      // recent_practice
      scope: { type: 'string', description: 'For recent_practice: "session" (default, dedup) or "global" (cross-session i+1 difficulty signal).' },
      include_abandoned: { type: 'integer', description: 'For recent_practice: 1 (default) include abandoned rows; 0 only completed=1.' },

      // vocabulary
      word: { type: 'string', description: 'Vocabulary item.' },
      words: { type: 'string', description: 'JSON array of word objects for batch word_upsert.' },
      item_kind: { type: 'string', description: 'word | chunk | pattern | personal_error.' },
      definition: { type: 'string' },
      chinese: { type: 'string' },
      ipa: { type: 'string' },
      pos: { type: 'string' },
      collocations: { type: 'string' },
      topics: { type: 'string', description: 'Comma- or JSON-array string. Persist mirrors entries into lexical_topics for strict topic-filter queries.' },
      topic: { type: 'string', description: 'For due_words: strict-match topic from lexical_topics.' },
      include_mastered: { type: 'integer', description: 'For due_words: 1 includes mastered words last seen >30d ago.' },
      example_en: { type: 'string' },
      example_cn: { type: 'string' },
      mastery: { type: 'string', description: 'queued_new | learning | known | mastered. Backend enforces transitions on word_review.' },
      origin: { type: 'string' },
      priority: { type: 'integer' },
      transfer_level: { type: 'integer' },
      is_user_word: { type: 'integer' },
      rating: { type: 'integer', description: 'Canonical 0-5 SRS rating for word_review.' },
      passed: { type: 'integer', description: '1 pass, 0 fail — convenience only; rating is canonical.' },
      card_type: { type: 'string', description: 'recall | production | collocation | meaning.' },
      sample_id: { type: 'integer', description: 'For word_review: linked sample id, if any.' },
      limit: { type: 'integer', description: 'Row limit for read actions.' },
      days: { type: 'integer', description: 'Lookback window for study_summary / coach_context / learner_state_scores / recent_practice scope=global.' },

      // profile
      profile: { type: 'string', description: 'JSON object for profile_upsert.' },
      name: { type: 'string' },
      current_level: { type: 'string' },
      target_level: { type: 'string' },
      target_exam: { type: 'string' },
      exam_date: { type: 'string' },
      interests: { type: 'string' },
      avoid_topics: { type: 'string' },
      daily_english: { type: 'string' },
      notes: { type: 'string' },
      initialized: { type: 'integer' },

      // sessions
      session_key: { type: 'string', description: 'Learning session key, e.g. tg:12345.' },
      status: { type: 'string', description: 'For session_end: closed | abandoned.' },

      // progress snapshots
      week: { type: 'string', description: 'ISO week, e.g. 2026-W19.' },
      period_start: { type: 'string' },
      period_end: { type: 'string' },
      listening_score: { type: 'number', description: 'Override for progress_snapshot. Omit to let server compute from learner_state_scores.' },
      speaking_score: { type: 'number' },
      reading_score: { type: 'number' },
      writing_score: { type: 'number' },
    },
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<string> {
    const action = String(args.action || 'practice');
    const db = getDatabase('study');

    if (context.sessionKey) {
      args.session_id = context.sessionKey;
    }

    try {
      if (['practice', 'word_review', 'word_upsert', 'profile_upsert'].includes(action)) {
        coachContextCache.clear();
      }

      switch (action) {
        case 'practice':              return JSON.stringify(logPractice(db, args));
        case 'word_upsert':           return JSON.stringify(upsertWords(db, args));
        case 'word_review':           return JSON.stringify(reviewWord(db, args));
        case 'due_words':             return JSON.stringify(dueWords(db, args));
        case 'word_lookup':           return JSON.stringify(wordLookup(db, args));
        case 'study_summary':         return JSON.stringify(studySummary(db, args));
        case 'coach_context': {
          const days = Number(args.days ?? 14);
          const limit = Number(args.limit ?? 8);
          const cacheKey = `${context.sessionKey || ''}:${days}:${limit}`;
          const cached = coachContextCache.get(cacheKey);
          if (cached && Date.now() - cached.ts < COACH_CONTEXT_CACHE_TTL_MS) {
            return JSON.stringify(cached.data);
          }
          const result = coachContext(db, args);
          coachContextCache.set(cacheKey, { data: result, ts: Date.now() });
          return JSON.stringify(result);
        }
        case 'recent_practice':       return JSON.stringify(recentPractice(db, args));
        case 'profile_upsert':        return JSON.stringify(profileUpsert(db, args));
        case 'session_start':         return JSON.stringify(sessionStart(db, args));
        case 'session_end':           return JSON.stringify(sessionEnd(db, args));
        case 'progress_snapshot':     return JSON.stringify(progressSnapshot(db, args));
        case 'progress_trend':        return JSON.stringify(progressTrend(db, args));
        case 'learner_state_scores':  return JSON.stringify(learnerStateScores(db, args));
        case 'onboarding_done':       return JSON.stringify(markOnboardingDone(String(args.step || '')));
        default:
          return JSON.stringify({ error: `Unknown persist action: ${action}` });
      }
    } catch (err) {
      return JSON.stringify({ error: (err as Error).message });
    }
  },
});
