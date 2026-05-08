/**
 * @module tools/persist
 * @description Typed English study-data gateway (thin dispatcher).
 *
 * All English learning data goes through this tool instead of raw SQL from
 * skills. Domain logic lives in `src/domain/` modules; this file only handles
 * tool registration and action routing.
 */

import { register } from './registry.js';
import { getDatabase } from './db.js';
import type { ToolContext } from '../agent/types.js';

// ── Domain imports ──────────────────────────────────────────────────────────
import { logPractice, taskUpsert, dueTasks, taskComplete } from '../domain/practice.js';
import { upsertWords, reviewWord, dueWords, wordLookup } from '../domain/vocabulary.js';
import { studySummary, progressSnapshot, progressTrend } from '../domain/progress.js';
import { sessionStart, sessionEnd } from '../domain/session.js';
import { profileUpsert, coachContext } from '../domain/profile.js';

register({
  name: 'persist',
  description: 'Typed gateway for English study.db. Default action="practice" writes practice evidence. Other actions: word_upsert, word_review, due_words, word_lookup, study_summary, coach_context, profile_upsert, task_upsert, due_tasks, task_complete, session_start, session_end, progress_snapshot, progress_trend. Skills must use this instead of raw db calls for learner data.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'practice (default) | word_upsert | word_review | due_words | word_lookup | study_summary | coach_context | profile_upsert | task_upsert | due_tasks | task_complete | session_start | session_end | progress_snapshot | progress_trend',
      },
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
      platform: { type: 'string', description: 'telegram | cli | cron | web.' },
      entrypoint: { type: 'string', description: 'new | cron_morning | manual | etc.' },
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

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<string> {
    const action = String(args.action || 'practice');
    const db = getDatabase('study');

    try {
      switch (action) {
        case 'practice':          return JSON.stringify(logPractice(db, args));
        case 'word_upsert':       return JSON.stringify(upsertWords(db, args));
        case 'word_review':       return JSON.stringify(reviewWord(db, args));
        case 'due_words':         return JSON.stringify(dueWords(db, args));
        case 'word_lookup':       return JSON.stringify(wordLookup(db, args));
        case 'study_summary':     return JSON.stringify(studySummary(db, args));
        case 'coach_context':     return JSON.stringify(coachContext(db, args));
        case 'profile_upsert':    return JSON.stringify(profileUpsert(db, args));
        case 'task_upsert':       return JSON.stringify(taskUpsert(db, args));
        case 'due_tasks':         return JSON.stringify(dueTasks(db, args));
        case 'task_complete':     return JSON.stringify(taskComplete(db, args));
        case 'session_start':     return JSON.stringify(sessionStart(db, args));
        case 'session_end':       return JSON.stringify(sessionEnd(db, args));
        case 'progress_snapshot': return JSON.stringify(progressSnapshot(db, args));
        case 'progress_trend':    return JSON.stringify(progressTrend(db, args));
        default:
          return JSON.stringify({ error: `Unknown persist action: ${action}` });
      }
    } catch (err) {
      return JSON.stringify({ error: (err as Error).message });
    }
  },
});
