/**
 * @module tools/persist
 * @description Structured practice persistence tool.
 *
 * Accepts structured parameters (not raw SQL) and writes all post-practice
 * data to study.db in a single atomic transaction. This eliminates SQL
 * construction errors from the LLM and reduces tool calls from 5-6 to 1.
 *
 * The LLM fills in a template with values; all SQL is generated server-side.
 */

import { register } from './registry.js';
import { getDatabase } from './db.js';
import type { ToolContext } from '../agent/types.js';

// ── Types ──

interface ErrorEntry {
  /** Canonical key from error-keys.md */
  key: string;
  /** listening | reading | writing | speaking | grammar | vocabulary */
  category: string;
  /** low | medium | high */
  severity?: string;
  /** What the user wrote/said */
  original?: string;
  /** The correct form */
  correction?: string;
  /** Brief explanation (Chinese OK) */
  note?: string;
}

interface SubcapEntry {
  /** Canonical subcap key (e.g. listening.connected_speech) */
  key: string;
  /** Band score 0.0–9.0 */
  score: number;
  /** Brief evidence note */
  evidence?: string;
}

// ── Tool Registration ──

register({
  name: 'persist',
  description: 'Write post-practice data to study.db in one atomic transaction. Use this instead of raw db calls for practice results. Fill in the structured fields — all SQL is generated automatically. Returns {ok, sample_id} on success.',
  parameters: {
    type: 'object',
    properties: {
      skill_type: {
        type: 'string',
        description: 'Skill identifier: listening.dictation, listening.podcast, listening.numberdrill, listening.mapdrill, speaking.freetalk, speaking.shadowing, writing.essay, writing.builder, writing.rewrite, writing.journal, reading.deepdive, reading.typetrain, reading.skim, vocab, etc.',
      },
      session_id: {
        type: 'string',
        description: 'Session key from the user input (e.g. "tg:12345"). Find it in [Session: tg:...].',
      },
      prompt: {
        type: 'string',
        description: 'The question/sentence/topic given to the user. NEVER leave empty.',
      },
      response: {
        type: 'string',
        description: 'The user\'s raw answer/dictation/essay text. NEVER leave empty.',
      },
      accuracy: {
        type: 'number',
        description: 'Correct ratio 0.0–1.0. Omit (null) for unscored activities like freetalk or journal.',
      },
      raw_score: {
        type: 'integer',
        description: 'Number of items correct (numerator). Omit for unscored.',
      },
      max_score: {
        type: 'integer',
        description: 'Total items (denominator). Omit for unscored.',
      },
      feedback: {
        type: 'string',
        description: 'Natural language diagnostic paragraph. What the user missed, root cause, overall performance. Do NOT use JSON.',
      },
      load_score: {
        type: 'number',
        description: 'Cognitive load: 1 (light drill), 2 (standard), 3 (heavy essay/mock). Default 2.',
      },
      audio_path: {
        type: 'string',
        description: 'Path to the TTS audio file (for listening skills, enables Revenge Protocol reuse).',
      },
      mode: {
        type: 'string',
        description: 'study (default) | exam | placement',
      },
      completed: {
        type: 'integer',
        description: '1 = finished (default), 0 = abandoned.',
      },
      section: {
        type: 'string',
        description: 'Section for activity_log: listening | reading | writing | speaking | vocab. Auto-inferred from skill_type if omitted.',
      },
      minutes: {
        type: 'integer',
        description: 'Approximate session duration in minutes (for activity_log). Default 1.',
      },
      errors: {
        type: 'string',
        description: 'JSON array of error objects: [{"key":"function_word_miss","category":"listening","severity":"medium","original":"soft","correction":"software","note":"词汇截断"}]. Keys must come from error-keys.md.',
      },
      subcap_scores: {
        type: 'string',
        description: 'JSON array of subcap objects: [{"key":"listening.connected_speech","score":4.5,"evidence":"弱读冠词遗漏"}].',
      },
      words_reviewed: {
        type: 'integer',
        description: 'Number of vocabulary words reviewed (for vocab skills, updates activity_log).',
      },
    },
    required: ['skill_type', 'session_id', 'prompt', 'response', 'feedback'],
  },

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<string> {
    const skillType = String(args.skill_type || '');
    const sessionId = String(args.session_id || '');
    const prompt = String(args.prompt || '');
    const rawContent = String(args.response || '');
    const feedback = String(args.feedback || '');

    if (!skillType) return JSON.stringify({ error: 'Missing skill_type' });
    if (!prompt) return JSON.stringify({ error: 'Missing prompt' });
    if (!rawContent) return JSON.stringify({ error: 'Missing response' });
    if (!feedback) return JSON.stringify({ error: 'Missing feedback' });

    const accuracy = args.accuracy !== undefined && args.accuracy !== null ? Number(args.accuracy) : null;
    const rawScore = args.raw_score !== undefined && args.raw_score !== null ? Number(args.raw_score) : null;
    const maxScore = args.max_score !== undefined && args.max_score !== null ? Number(args.max_score) : null;
    const loadScore = Number(args.load_score ?? 2);
    const audioPath = args.audio_path ? String(args.audio_path) : null;
    const mode = String(args.mode || 'study');
    const completed = Number(args.completed ?? 1);
    const section = String(args.section || inferSection(skillType));
    const minutes = Number(args.minutes ?? 1);
    const wordsReviewed = args.words_reviewed !== undefined ? Number(args.words_reviewed) : null;

    // Parse errors array
    let errors: ErrorEntry[] = [];
    if (args.errors) {
      try {
        errors = typeof args.errors === 'string' ? JSON.parse(args.errors) : args.errors as ErrorEntry[];
        if (!Array.isArray(errors)) errors = [];
      } catch {
        return JSON.stringify({ error: 'Invalid errors JSON — must be an array of {key, category, severity?, original?, correction?, note?}' });
      }
    }

    // Parse subcap_scores array
    let subcaps: SubcapEntry[] = [];
    if (args.subcap_scores) {
      try {
        subcaps = typeof args.subcap_scores === 'string' ? JSON.parse(args.subcap_scores) : args.subcap_scores as SubcapEntry[];
        if (!Array.isArray(subcaps)) subcaps = [];
      } catch {
        return JSON.stringify({ error: 'Invalid subcap_scores JSON — must be an array of {key, score, evidence?}' });
      }
    }

    const db = getDatabase('study');

    try {
      db.exec('BEGIN');

      // 1. Insert samples row
      const sampleStmt = db.prepare(`
        INSERT INTO samples (
          created_at, skill_type, prompt, raw_content,
          accuracy, raw_score, max_score,
          session_id, feedback, mode, completed,
          load_score, audio_path
        ) VALUES (
          datetime('now'), ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?
        )
      `);
      const sampleResult = sampleStmt.run(
        skillType, prompt, rawContent,
        accuracy, rawScore, maxScore,
        sessionId, feedback, mode, completed,
        loadScore, audioPath,
      );
      const sampleId = typeof sampleResult.lastInsertRowid === 'bigint'
        ? Number(sampleResult.lastInsertRowid)
        : sampleResult.lastInsertRowid as number;

      // 2. Insert error rows
      if (errors.length > 0) {
        const errorStmt = db.prepare(`
          INSERT INTO errors (sample_id, recurrence_key, category, severity, original_phrase, correction, rule_note)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        for (const e of errors) {
          errorStmt.run(
            sampleId,
            e.key || '',
            e.category || '',
            e.severity || 'medium',
            e.original || '',
            e.correction || '',
            e.note || '',
          );
        }
      }

      // 3. Insert subcap_scores rows
      if (subcaps.length > 0) {
        const subcapStmt = db.prepare(`
          INSERT INTO subcap_scores (sample_id, subcap_key, score, evidence, created_at)
          VALUES (?, ?, ?, ?, datetime('now'))
        `);
        for (const s of subcaps) {
          subcapStmt.run(sampleId, s.key || '', s.score ?? 0, s.evidence || '');
        }
      }

      // 4. Upsert activity_log
      const activityStmt = db.prepare(`
        INSERT INTO activity_log (date, sessions_count, minutes_total, sections_touched, words_reviewed)
        VALUES (date('now'), 1, ?, ?, ?)
        ON CONFLICT(date) DO UPDATE SET
          sessions_count = activity_log.sessions_count + 1,
          minutes_total = activity_log.minutes_total + excluded.minutes_total,
          words_reviewed = activity_log.words_reviewed + excluded.words_reviewed,
          sections_touched = CASE
            WHEN activity_log.sections_touched = '' THEN excluded.sections_touched
            WHEN INSTR(activity_log.sections_touched, excluded.sections_touched) > 0 THEN activity_log.sections_touched
            ELSE activity_log.sections_touched || ',' || excluded.sections_touched
          END
      `);
      activityStmt.run(minutes, section, wordsReviewed ?? 0);

      db.exec('COMMIT');

      return JSON.stringify({
        ok: true,
        sample_id: sampleId,
        errors_count: errors.length,
        subcaps_count: subcaps.length,
      });
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch { /* ignore */ }
      return JSON.stringify({ error: (err as Error).message });
    }
  },
});

/** Infer activity_log section from skill_type */
function inferSection(skillType: string): string {
  if (skillType.startsWith('listening')) return 'listening';
  if (skillType.startsWith('speaking')) return 'speaking';
  if (skillType.startsWith('writing')) return 'writing';
  if (skillType.startsWith('reading')) return 'reading';
  if (skillType.startsWith('vocab')) return 'vocab';
  return 'other';
}
