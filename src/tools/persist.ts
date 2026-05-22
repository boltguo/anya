// tools/persist.ts — study.db unified writer

import { register } from './registry.js';
import { getDatabase } from '../storage/study/db.js';
import { getConfig, persistConfig } from '../config/loader.js';
import type { ToolContext } from '../agent/types.js';

import { logPractice, recentPractice, taskUpsert, dueTasks, taskComplete } from '../storage/study/practice.js';
import { upsertWords, reviewWord, dueWords, wordLookup } from '../storage/study/vocabulary.js';
import { studySummary, progressSnapshot, progressTrend } from '../storage/study/progress.js';
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

// coach_context aggregates 14-day data; cache cuts redundant queries within a session.
// Invalidated on writes that change aggregated inputs (practice, word_*, task_*, profile_*).
const COACH_CONTEXT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const coachContextCache = new Map<string, { data: unknown; ts: number }>();

register({
  name: 'persist',
  description: 'Typed gateway for English study.db. Default action="practice" writes practice evidence. Other actions: word_upsert, word_review, due_words, word_lookup, study_summary, coach_context, recent_practice, profile_upsert, task_upsert, due_tasks, task_complete, session_start, session_end, progress_snapshot, progress_trend, onboarding_done. Skills must use this instead of raw db calls for learner data.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'practice (default) | word_upsert | word_review | due_words | word_lookup | study_summary | coach_context | recent_practice | profile_upsert | task_upsert | due_tasks | task_complete | session_start | session_end | progress_snapshot | progress_trend | onboarding_done',
      },
      step: { type: 'string', description: 'For onboarding_done: "profile" after profile-manager finishes, "placement" after placement-quick finishes.' },
      include_abandoned: { type: 'integer', description: 'For recent_practice: 1 (default) include completed=0 abandoned rows; 0 only completed=1.' },
      skill_type: { type: 'string', description: 'Practice skill identifier, e.g. listening.dictation, writing.essay, vocab.review.' },
      session_id: { type: 'string', description: 'Session key from the user input, e.g. tg:12345.' },
      prompt: { type: 'string', description: 'Practice prompt/question/topic. Required for action=practice unless completed=0.' },
      response: { type: 'string', description: 'User raw answer. Required for action=practice unless completed=0.' },
      feedback: { type: 'string', description: 'Natural-language diagnostic paragraph. Required for action=practice unless completed=0.' },
      accuracy: { type: 'number', description: 'Correct ratio 0.0-1.0.' },
      raw_score: { type: 'integer', description: 'Items correct.' },
      max_score: { type: 'integer', description: 'Items total.' },
      load_score: { type: 'number', description: 'Cognitive load: 1 light, 2 standard, 3 heavy.' },
      audio_path: { type: 'string', description: 'TTS/user audio path.' },
      image_path: { type: 'string', description: 'Image path.' },
      source_url: { type: 'string', description: 'Source URL.' },
      mode: { type: 'string', description: 'study | exam | placement | review.' },
      completed: { type: 'integer', description: '1 finished, 0 abandoned.' },
      section: { type: 'string', description: 'listening | speaking | reading | writing | vocab | coaching.' },
      domain: { type: 'string', description: 'Ability domain. Defaults to section.' },
      minutes: { type: 'integer', description: 'Approximate minutes.' },
      duration_seconds: { type: 'integer', description: 'Wall-clock seconds.' },
      band_task: { type: 'number' },
      band_coherence: { type: 'number' },
      band_lexical: { type: 'number' },
      band_grammar: { type: 'number' },
      band_pronunciation: { type: 'number' },
      band_overall: { type: 'number' },
      ui_feedback: { type: 'string' },
      translation: { type: 'string' },
      parent_sample_id: { type: 'integer' },
      redo_count: { type: 'integer' },
      prompt_hash: { type: 'string' },
      metadata: { type: 'string', description: 'JSON object string for skill-owned extras.' },
      errors: { type: 'string', description: 'JSON array of {key, category, severity, original, correction, note}.' },
      subcap_scores: { type: 'string', description: 'JSON array of {key, score, evidence}.' },
      words_reviewed: { type: 'integer', description: 'Vocabulary words reviewed in a practice batch.' },

      word: { type: 'string', description: 'Vocabulary item for word_upsert, word_review, or word_lookup.' },
      words: { type: 'string', description: 'JSON array of word objects for word_upsert.' },
      item_kind: { type: 'string', description: 'word | chunk | pattern | personal_error.' },
      definition: { type: 'string' },
      chinese: { type: 'string' },
      ipa: { type: 'string' },
      pos: { type: 'string' },
      collocations: { type: 'string' },
      topics: { type: 'string' },
      example_en: { type: 'string' },
      example_cn: { type: 'string' },
      mastery: { type: 'string', description: 'queued_new | learning | known | mastered.' },
      origin: { type: 'string' },
      priority: { type: 'integer' },
      transfer_level: { type: 'integer' },
      is_user_word: { type: 'integer' },
      rating: { type: 'integer', description: 'SRS rating 0-5 for word_review.' },
      passed: { type: 'integer', description: '1 pass, 0 fail for word_review.' },
      card_type: { type: 'string', description: 'recall | production | collocation | meaning.' },
      context: { type: 'string', description: 'Short review context.' },
      limit: { type: 'integer', description: 'Row limit for read actions.' },
      days: { type: 'integer', description: 'Lookback window for study_summary or coach_context.' },

      profile: { type: 'string', description: 'JSON object for profile_upsert.' },
      date: { type: 'string', description: 'YYYY-MM-DD date for task actions. Defaults to today.' },
      task_id: { type: 'integer', description: 'daily_tasks id for task_complete.' },
      task_type: { type: 'string', description: 'primary | review | consolidation | challenge.' },
      skill: { type: 'string', description: 'Concrete skill slug for task_upsert.' },
      callback: { type: 'string', description: 'Callback payload for task_upsert.' },
      reason: { type: 'string', description: 'Why this task is planned.' },
      planned_minutes: { type: 'integer', description: 'Planned task duration.' },
      sample_id: { type: 'integer', description: 'Completed sample id for task_complete.' },

      study_session_id: { type: 'integer', description: 'study_sessions id for session_end.' },
      session_key: { type: 'string', description: 'Learning session key, e.g. tg:12345.' },
      platform: { type: 'string', description: 'telegram | cli | web.' },
      entrypoint: { type: 'string', description: 'new | manual | etc.' },
      skills_used: { type: 'string', description: 'JSON array of skill slugs used in a learning session.' },
      plan: { type: 'string', description: 'JSON plan object/array for a learning session.' },
      summary_text: { type: 'string', description: 'Session recap for session_end.' },
      status: { type: 'string', description: 'active | closed | abandoned.' },
      week: { type: 'string', description: 'ISO week for progress_snapshot/progress_trend, e.g. 2026-W19.' },
      period_start: { type: 'string', description: 'Snapshot period start, YYYY-MM-DD.' },
      period_end: { type: 'string', description: 'Snapshot period end, YYYY-MM-DD.' },
      current_level: { type: 'string', description: 'Current learner level at snapshot time.' },
      listening_score: { type: 'number', description: 'Learner-state computed score, usually 0-100.' },
      speaking_score: { type: 'number', description: 'Learner-state computed score, usually 0-100.' },
      reading_score: { type: 'number', description: 'Learner-state computed score, usually 0-100.' },
      writing_score: { type: 'number', description: 'Learner-state computed score, usually 0-100.' },
      vocab_active_count: { type: 'integer' },
      vocab_mature_count: { type: 'integer' },
      total_minutes: { type: 'integer' },
      active_days: { type: 'integer' },
      sessions_count: { type: 'integer' },
      samples_count: { type: 'integer' },
      due_words_count: { type: 'integer' },
      weak_subcaps: { type: 'string', description: 'JSON array computed by learner-state.' },
      top_errors: { type: 'string', description: 'JSON array computed by learner-state.' },
      notes: { type: 'string', description: 'Progress snapshot notes.' },
    },
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<string> {
    const action = String(args.action || 'practice');
    const db = getDatabase('study');

    // Server-side override prevents the LLM from supplying a bogus session id.
    if (context.sessionKey) {
      args.session_id = context.sessionKey;
    }

    try {
      // Writes that affect aggregated inputs must invalidate the cache to keep reads correct.
      if (['practice', 'word_review', 'word_upsert', 'task_complete', 'profile_upsert', 'task_upsert'].includes(action)) {
        coachContextCache.clear();
      }

      switch (action) {
        case 'practice':          return JSON.stringify(logPractice(db, args));
        case 'word_upsert':       return JSON.stringify(upsertWords(db, args));
        case 'word_review':       return JSON.stringify(reviewWord(db, args));
        case 'due_words':         return JSON.stringify(dueWords(db, args));
        case 'word_lookup':       return JSON.stringify(wordLookup(db, args));
        case 'study_summary':     return JSON.stringify(studySummary(db, args));
        case 'coach_context': {
          const days = Number(args.days ?? 14);
          const limit = Number(args.limit ?? 8);
          const date = String(args.date || new Date().toISOString().slice(0, 10));
          const cacheKey = `${context.sessionKey || ''}:${days}:${limit}:${date}`;
          const cached = coachContextCache.get(cacheKey);
          if (cached && Date.now() - cached.ts < COACH_CONTEXT_CACHE_TTL_MS) {
            return JSON.stringify(cached.data);
          }
          const result = coachContext(db, args);
          coachContextCache.set(cacheKey, { data: result, ts: Date.now() });
          return JSON.stringify(result);
        }
        case 'recent_practice':   return JSON.stringify(recentPractice(db, args));
        case 'profile_upsert':    return JSON.stringify(profileUpsert(db, args));
        case 'task_upsert':       return JSON.stringify(taskUpsert(db, args));
        case 'due_tasks':         return JSON.stringify(dueTasks(db, args));
        case 'task_complete':     return JSON.stringify(taskComplete(db, args));
        case 'session_start':     return JSON.stringify(sessionStart(db, args));
        case 'session_end':       return JSON.stringify(sessionEnd(db, args));
        case 'progress_snapshot': return JSON.stringify(progressSnapshot(db, args));
        case 'progress_trend':    return JSON.stringify(progressTrend(db, args));
        case 'onboarding_done':   return JSON.stringify(markOnboardingDone(String(args.step || '')));
        default:
          return JSON.stringify({ error: `Unknown persist action: ${action}` });
      }
    } catch (err) {
      return JSON.stringify({ error: (err as Error).message });
    }
  },
});
