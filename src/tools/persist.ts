/**
 * @module tools/persist
 * @description Typed English study-data gateway.
 *
 * All English learning data goes through this tool instead of raw SQL from
 * skills. The default action is `practice`, which writes post-practice
 * evidence in one transaction. Vocabulary, SRS review, profile updates, and
 * learner summaries are exposed as typed actions.
 */

import { register } from './registry.js';
import { getDatabase } from './db.js';
import type { ToolContext } from '../agent/types.js';

interface ErrorEntry {
  key: string;
  category: string;
  severity?: string;
  original?: string;
  correction?: string;
  note?: string;
}

interface SubcapEntry {
  key: string;
  score: number;
  evidence?: string;
}

interface WordEntry {
  word?: string;
  item_kind?: string;
  definition?: string;
  chinese?: string;
  translation?: string;
  ipa?: string;
  pos?: string;
  collocations?: string;
  topics?: string;
  example_en?: string;
  example_cn?: string;
  audio_path?: string;
  mastery?: string;
  origin?: string;
  source_sample_id?: number;
  priority?: number;
  transfer_level?: number;
  is_user_word?: number;
  srs_due?: string;
  metadata?: string;
}

register({
  name: 'persist',
  description: 'Typed gateway for English study.db. Default action="practice" writes practice evidence. Other actions: word_upsert, word_review, due_words, word_lookup, study_summary, profile_upsert, task_upsert, due_tasks, task_complete. Skills must use this instead of raw db calls for learner data.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'practice (default) | word_upsert | word_review | due_words | word_lookup | study_summary | profile_upsert | task_upsert | due_tasks | task_complete',
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
      days: { type: 'integer', description: 'Lookback window for study_summary.' },

      profile: { type: 'string', description: 'JSON object for profile_upsert.' },
      date: { type: 'string', description: 'YYYY-MM-DD date for task actions. Defaults to today.' },
      task_id: { type: 'integer', description: 'daily_tasks id for task_complete.' },
      task_type: { type: 'string', description: 'primary | review | consolidation | challenge.' },
      skill: { type: 'string', description: 'Concrete skill slug for task_upsert.' },
      callback: { type: 'string', description: 'Callback payload for task_upsert.' },
      reason: { type: 'string', description: 'Why this task is planned.' },
      planned_minutes: { type: 'integer', description: 'Planned task duration.' },
      sample_id: { type: 'integer', description: 'Completed sample id for task_complete.' },
    },
  },

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<string> {
    const action = String(args.action || 'practice');
    const db = getDatabase('study');

    try {
      switch (action) {
        case 'practice':
          return JSON.stringify(logPractice(db, args));
        case 'word_upsert':
          return JSON.stringify(upsertWords(db, args));
        case 'word_review':
          return JSON.stringify(reviewWord(db, args));
        case 'due_words':
          return JSON.stringify(dueWords(db, args));
        case 'word_lookup':
          return JSON.stringify(wordLookup(db, args));
        case 'study_summary':
          return JSON.stringify(studySummary(db, args));
        case 'profile_upsert':
          return JSON.stringify(profileUpsert(db, args));
        case 'task_upsert':
          return JSON.stringify(taskUpsert(db, args));
        case 'due_tasks':
          return JSON.stringify(dueTasks(db, args));
        case 'task_complete':
          return JSON.stringify(taskComplete(db, args));
        default:
          return JSON.stringify({ error: `Unknown persist action: ${action}` });
      }
    } catch (err) {
      return JSON.stringify({ error: (err as Error).message });
    }
  },
});

function logPractice(db: ReturnType<typeof getDatabase>, args: Record<string, unknown>): unknown {
  const skillType = String(args.skill_type || '');
  const completed = Number(args.completed ?? 1);
  const prompt = String(args.prompt || (completed === 0 ? '[abandoned]' : ''));
  const rawContent = String(args.response || (completed === 0 ? '[abandoned]' : ''));
  const feedback = String(args.feedback || (completed === 0 ? 'Session abandoned before evaluation.' : ''));

  if (!skillType) return { error: 'Missing skill_type' };
  if (!prompt) return { error: 'Missing prompt' };
  if (!rawContent) return { error: 'Missing response' };
  if (!feedback) return { error: 'Missing feedback' };

  const sessionId = String(args.session_id || '');
  const accuracy = optionalNumber(args.accuracy);
  const rawScore = optionalNumber(args.raw_score);
  const maxScore = optionalNumber(args.max_score);
  const loadScore = Number(args.load_score ?? 2);
  const audioPath = args.audio_path ? String(args.audio_path) : null;
  const imagePath = args.image_path ? String(args.image_path) : null;
  const sourceUrl = String(args.source_url || '');
  const mode = String(args.mode || 'study');
  const section = String(args.section || inferSection(skillType));
  const domain = String(args.domain || section);
  const minutes = Number(args.minutes ?? 1);
  const durationSeconds = Number(args.duration_seconds ?? minutes * 60);
  const bandOverall = optionalNumber(args.band_overall);
  const wordsReviewed = args.words_reviewed !== undefined ? Number(args.words_reviewed) : null;
  const errors = parseJsonList<ErrorEntry>(args.errors, 'errors');
  const subcaps = parseJsonList<SubcapEntry>(args.subcap_scores, 'subcap_scores');

  db.exec('BEGIN');
  try {
    const sampleStmt = db.prepare(`
      INSERT INTO samples (
        created_at, skill_type, domain, section, prompt, raw_content,
        accuracy, raw_score, max_score, session_id, feedback, mode, completed,
        load_score, audio_path, image_path, source_url, minutes, duration_seconds,
        band_task, band_coherence, band_lexical, band_grammar, band_pronunciation, band_overall,
        ui_feedback, translation, parent_sample_id, redo_count, prompt_hash, metadata
      ) VALUES (
        datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `);
    const sampleResult = sampleStmt.run(
      skillType, domain, section, prompt, rawContent,
      accuracy, rawScore, maxScore, sessionId, feedback, mode, completed,
      loadScore, audioPath, imagePath, sourceUrl, minutes, durationSeconds,
      optionalNumber(args.band_task), optionalNumber(args.band_coherence),
      optionalNumber(args.band_lexical), optionalNumber(args.band_grammar),
      optionalNumber(args.band_pronunciation), bandOverall,
      String(args.ui_feedback || ''), String(args.translation || ''),
      optionalNumber(args.parent_sample_id), Number(args.redo_count ?? 0),
      String(args.prompt_hash || ''), normalizeJsonString(args.metadata),
    );
    const sampleId = normalizeRowId(sampleResult.lastInsertRowid);

    const errorStmt = db.prepare(`
      INSERT INTO errors (sample_id, recurrence_key, category, severity, original_phrase, correction, rule_note)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const patternStmt = db.prepare(`
      INSERT INTO error_patterns (
        recurrence_key, category, severity_score, seen_count,
        last_seen_at, last_sample_id, last_original, last_correction, rule_note
      ) VALUES (?, ?, ?, 1, datetime('now'), ?, ?, ?, ?)
      ON CONFLICT(recurrence_key) DO UPDATE SET
        category = excluded.category,
        severity_score = MAX(error_patterns.severity_score, excluded.severity_score),
        seen_count = error_patterns.seen_count + 1,
        last_seen_at = excluded.last_seen_at,
        last_sample_id = excluded.last_sample_id,
        last_original = excluded.last_original,
        last_correction = excluded.last_correction,
        rule_note = excluded.rule_note
    `);
    for (const e of errors) {
      const key = String(e.key || '');
      if (!key) continue;
      const category = String(e.category || section);
      const severity = String(e.severity || 'medium');
      const original = String(e.original || '');
      const correction = String(e.correction || '');
      const note = String(e.note || '');
      errorStmt.run(sampleId, key, category, severity, original, correction, note);
      patternStmt.run(key, category, severityScore(severity), sampleId, original, correction, note);
    }

    const subcapStmt = db.prepare(`
      INSERT INTO subcap_scores (sample_id, subcap_key, score, evidence, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `);
    for (const s of subcaps) {
      const key = String(s.key || '');
      if (!key) continue;
      subcapStmt.run(sampleId, key, Number(s.score ?? 0), String(s.evidence || ''));
    }

    upsertActivity(db, minutes, section, wordsReviewed ?? 0, 0);
    if (bandOverall !== null) upsertBandTrend(db, section, bandOverall, skillType);

    db.exec('COMMIT');
    return { ok: true, action: 'practice', sample_id: sampleId, errors_count: errors.length, subcaps_count: subcaps.length };
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  }
}

function taskUpsert(db: ReturnType<typeof getDatabase>, args: Record<string, unknown>): unknown {
  const skill = String(args.skill || args.callback || '').trim();
  if (!skill) return { error: 'Missing skill' };
  const date = String(args.date || 'now');
  const result = db.prepare(`
    INSERT INTO daily_tasks (
      date, domain, task_type, skill, mode, callback, reason, load_score, planned_minutes
    ) VALUES (
      CASE WHEN ? = 'now' THEN date('now') ELSE ? END, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `).run(
    date, date,
    String(args.domain || args.section || inferSection(skill)),
    String(args.task_type || 'primary'),
    skill,
    String(args.mode || 'study'),
    String(args.callback || skill),
    String(args.reason || ''),
    Number(args.load_score ?? 0),
    Number(args.planned_minutes ?? args.minutes ?? 0),
  );
  return { ok: true, action: 'task_upsert', task_id: normalizeRowId(result.lastInsertRowid) };
}

function dueTasks(db: ReturnType<typeof getDatabase>, args: Record<string, unknown>): unknown {
  const date = String(args.date || 'now');
  const rows = db.prepare(`
    SELECT id, date, domain, task_type, skill, mode, callback, reason,
           planned_minutes, load_score, completed, sample_id
    FROM daily_tasks
    WHERE date = CASE WHEN ? = 'now' THEN date('now') ELSE ? END
    ORDER BY completed ASC,
      CASE task_type WHEN 'primary' THEN 1 WHEN 'review' THEN 2 WHEN 'consolidation' THEN 3 ELSE 4 END,
      id ASC
  `).all(date, date);
  return { ok: true, action: 'due_tasks', rows, count: rows.length };
}

function taskComplete(db: ReturnType<typeof getDatabase>, args: Record<string, unknown>): unknown {
  const taskId = optionalNumber(args.task_id);
  if (taskId === null) return { error: 'Missing task_id' };
  const result = db.prepare(`
    UPDATE daily_tasks
    SET completed = 1, completed_at = datetime('now'), sample_id = COALESCE(?, sample_id)
    WHERE id = ?
  `).run(optionalNumber(args.sample_id), taskId);
  return { ok: true, action: 'task_complete', changes: Number(result.changes) };
}

function upsertWords(db: ReturnType<typeof getDatabase>, args: Record<string, unknown>): unknown {
  const entries = parseWordEntries(args);
  if (entries.length === 0) return { error: 'Missing word or words' };

  db.exec('BEGIN');
  try {
    const stmt = db.prepare(`
      INSERT INTO words (
        word, item_kind, definition, chinese, ipa, pos, collocations, topics,
        example_en, example_cn, audio_path, mastery, origin, source_sample_id,
        priority, transfer_level, is_user_word, srs_due, introduced_at,
        created_at, updated_at, metadata
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'),
        datetime('now'), datetime('now'), ?
      )
      ON CONFLICT(word) DO UPDATE SET
        item_kind=CASE WHEN excluded.item_kind != '' THEN excluded.item_kind ELSE words.item_kind END,
        definition=CASE WHEN excluded.definition != '' THEN excluded.definition ELSE words.definition END,
        chinese=CASE WHEN excluded.chinese != '' THEN excluded.chinese ELSE words.chinese END,
        ipa=CASE WHEN excluded.ipa != '' THEN excluded.ipa ELSE words.ipa END,
        pos=CASE WHEN excluded.pos != '' THEN excluded.pos ELSE words.pos END,
        collocations=CASE WHEN excluded.collocations != '' THEN excluded.collocations ELSE words.collocations END,
        topics=CASE WHEN excluded.topics != '' THEN excluded.topics ELSE words.topics END,
        example_en=CASE WHEN excluded.example_en != '' THEN excluded.example_en ELSE words.example_en END,
        example_cn=CASE WHEN excluded.example_cn != '' THEN excluded.example_cn ELSE words.example_cn END,
        audio_path=CASE WHEN excluded.audio_path != '' THEN excluded.audio_path ELSE words.audio_path END,
        mastery=CASE WHEN words.mastery = 'mastered' THEN words.mastery ELSE excluded.mastery END,
        origin=CASE WHEN excluded.origin != '' THEN excluded.origin ELSE words.origin END,
        source_sample_id=COALESCE(excluded.source_sample_id, words.source_sample_id),
        priority=MAX(words.priority, excluded.priority),
        transfer_level=MAX(words.transfer_level, excluded.transfer_level),
        is_user_word=MAX(words.is_user_word, excluded.is_user_word),
        srs_due=COALESCE(words.srs_due, excluded.srs_due),
        metadata=CASE WHEN excluded.metadata != '' THEN excluded.metadata ELSE words.metadata END,
        updated_at=datetime('now')
    `);

    let changed = 0;
    for (const entry of entries) {
      const word = String(entry.word || '').trim();
      if (!word) continue;
      const result = stmt.run(
        word,
        String(entry.item_kind || args.item_kind || 'word'),
        String(entry.definition || args.definition || ''),
        String(entry.chinese || entry.translation || args.chinese || ''),
        String(entry.ipa || args.ipa || ''),
        String(entry.pos || args.pos || ''),
        String(entry.collocations || args.collocations || ''),
        String(entry.topics || args.topics || ''),
        String(entry.example_en || args.example_en || ''),
        String(entry.example_cn || args.example_cn || ''),
        String(entry.audio_path || args.audio_path || ''),
        String(entry.mastery || args.mastery || 'queued_new'),
        String(entry.origin || args.origin || 'practice_harvest'),
        optionalNumber(entry.source_sample_id ?? args.source_sample_id),
        Number(entry.priority ?? args.priority ?? 0),
        Number(entry.transfer_level ?? args.transfer_level ?? 0),
        Number(entry.is_user_word ?? args.is_user_word ?? 0),
        String(entry.srs_due || args.srs_due || nowSql()),
        normalizeJsonString(entry.metadata ?? args.metadata),
      );
      changed += Number(result.changes);
    }
    upsertActivity(db, 0, 'vocab', 0, changed);
    db.exec('COMMIT');
    return { ok: true, action: 'word_upsert', count: entries.length, changes: changed };
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  }
}

function reviewWord(db: ReturnType<typeof getDatabase>, args: Record<string, unknown>): unknown {
  const word = String(args.word || '').trim();
  if (!word) return { error: 'Missing word' };
  const rating = clampInt(Number(args.rating ?? (Number(args.passed ?? 0) ? 4 : 1)), 0, 5);
  const passed = rating >= 3 ? 1 : 0;
  const sessionId = String(args.session_id || '');
  const context = String(args.context || '');
  const cardType = String(args.card_type || 'recall');

  db.exec('BEGIN');
  try {
    const row = db.prepare('SELECT review_count, srs_interval_days, srs_ease FROM words WHERE word = ?').get(word) as {
      review_count?: number; srs_interval_days?: number; srs_ease?: number;
    } | undefined;
    if (!row) throw new Error(`word not found: ${word}`);

    const [intervalDays, ease] = nextSrsState(Number(row.review_count || 0), Number(row.srs_interval_days || 0), Number(row.srs_ease || 2.5), rating);
    db.prepare(`
      UPDATE words
      SET review_count = review_count + 1,
          success_count = success_count + ?,
          fail_count = fail_count + ?,
          last_result = ?,
          srs_due = datetime('now', ?),
          srs_interval_days = ?,
          srs_ease = ?,
          last_seen_at = datetime('now'),
          updated_at = datetime('now'),
          transfer_level = CASE WHEN ? = 1 THEN MAX(transfer_level, ?) ELSE transfer_level END,
          mastery = CASE
            WHEN ? = 1 AND success_count + 1 >= 5 THEN 'mastered'
            WHEN ? = 1 AND success_count + 1 >= 3 THEN 'known'
            WHEN mastery = 'queued_new' THEN 'learning'
            ELSE mastery
          END
      WHERE word = ?
    `).run(
      passed, passed ? 0 : 1, passed ? 'pass' : 'fail',
      `+${intervalDays} days`, intervalDays, ease,
      passed, Number(args.transfer_level ?? 0),
      passed, passed, word,
    );
    db.prepare(`
      INSERT INTO word_reviews (word, session_id, rating, passed, interval_days, card_type, context)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(word, sessionId, rating, passed, intervalDays, cardType, context);
    upsertActivity(db, 0, 'vocab', 1, 0);
    db.exec('COMMIT');
    return { ok: true, action: 'word_review', word, rating, passed, interval_days: intervalDays };
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  }
}

function dueWords(db: ReturnType<typeof getDatabase>, args: Record<string, unknown>): unknown {
  const limit = clampInt(Number(args.limit ?? 8), 1, 20);
  const topic = String(args.topics || args.topic || '').trim();
  const params: unknown[] = [];
  let topicClause = '';
  if (topic) {
    topicClause = 'AND topics LIKE ?';
    params.push(`%${topic}%`);
  }
  params.push(limit);
  const rows = db.prepare(`
    SELECT word, item_kind, definition, chinese, ipa, pos, collocations, topics,
           example_en, example_cn, audio_path, mastery, transfer_level,
           review_count, success_count, fail_count, srs_due
    FROM words
    WHERE mastery IN ('queued_new','learning','known')
      AND (srs_due IS NULL OR srs_due <= datetime('now'))
      ${topicClause}
    ORDER BY is_user_word DESC, priority DESC, srs_due ASC, updated_at ASC
    LIMIT ?
  `).all(...params as []);
  return { ok: true, action: 'due_words', rows, count: rows.length };
}

function wordLookup(db: ReturnType<typeof getDatabase>, args: Record<string, unknown>): unknown {
  const word = String(args.word || '').trim();
  if (!word) return { error: 'Missing word' };
  const row = db.prepare('SELECT * FROM words WHERE word = ?').get(word);
  return { ok: true, action: 'word_lookup', found: Boolean(row), row };
}

function studySummary(db: ReturnType<typeof getDatabase>, args: Record<string, unknown>): unknown {
  const days = clampInt(Number(args.days ?? 14), 1, 180);
  const since = `-${days} days`;
  const samples = db.prepare(`
    SELECT section, skill_type, COUNT(*) AS n,
           ROUND(AVG(accuracy), 3) AS avg_accuracy,
           ROUND(AVG(band_overall), 2) AS avg_band
    FROM samples
    WHERE created_at >= date('now', ?)
    GROUP BY section, skill_type
    ORDER BY section, n DESC
  `).all(since);
  const bands = db.prepare(`
    SELECT section, ROUND(AVG(band_overall), 2) AS avg_band, COUNT(*) AS n
    FROM samples
    WHERE band_overall IS NOT NULL AND created_at >= date('now', ?)
    GROUP BY section
    ORDER BY section
  `).all(since);
  const errors = db.prepare(`
    SELECT recurrence_key, category, seen_count, severity_score, last_seen_at, rule_note
    FROM error_patterns
    ORDER BY (seen_count * severity_score) DESC, last_seen_at DESC
    LIMIT 12
  `).all();
  const subcaps = db.prepare(`
    SELECT subcap_key, ROUND(AVG(score), 2) AS avg_score, COUNT(*) AS n
    FROM subcap_scores
    WHERE created_at >= date('now', ?)
    GROUP BY subcap_key
    ORDER BY avg_score ASC, n DESC
    LIMIT 16
  `).all(since);
  const activity = db.prepare(`
    SELECT date, sessions_count, minutes_total, sections_touched, words_reviewed, new_words_added
    FROM activity_log
    WHERE date >= date('now', ?)
    ORDER BY date ASC
  `).all(since);
  const vocab = db.prepare(`
    SELECT mastery, COUNT(*) AS n FROM words GROUP BY mastery
  `).all();
  return { ok: true, action: 'study_summary', days, samples, bands, errors, subcaps, activity, vocab };
}

function profileUpsert(db: ReturnType<typeof getDatabase>, args: Record<string, unknown>): unknown {
  const profile = parseJsonObject(args.profile);
  const merged = { ...profile, ...args };
  db.exec('BEGIN');
  try {
    db.prepare(`
      INSERT INTO learner_profile (
        id, initialized, name, l1, timezone, current_level, target_level,
        target_exam, exam_date, daily_minutes, preferred_tone, study_pattern,
        interests, avoid_topics, daily_english, strengths, weaknesses, notes,
        created_at, updated_at
      ) VALUES (
        1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now')
      )
      ON CONFLICT(id) DO UPDATE SET
        initialized=MAX(learner_profile.initialized, excluded.initialized),
        name=COALESCE(NULLIF(excluded.name, ''), learner_profile.name),
        l1=COALESCE(NULLIF(excluded.l1, ''), learner_profile.l1),
        timezone=COALESCE(NULLIF(excluded.timezone, ''), learner_profile.timezone),
        current_level=COALESCE(NULLIF(excluded.current_level, ''), learner_profile.current_level),
        target_level=COALESCE(NULLIF(excluded.target_level, ''), learner_profile.target_level),
        target_exam=COALESCE(NULLIF(excluded.target_exam, ''), learner_profile.target_exam),
        exam_date=COALESCE(excluded.exam_date, learner_profile.exam_date),
        daily_minutes=CASE WHEN excluded.daily_minutes > 0 THEN excluded.daily_minutes ELSE learner_profile.daily_minutes END,
        preferred_tone=COALESCE(NULLIF(excluded.preferred_tone, ''), learner_profile.preferred_tone),
        study_pattern=COALESCE(NULLIF(excluded.study_pattern, ''), learner_profile.study_pattern),
        interests=COALESCE(NULLIF(excluded.interests, ''), learner_profile.interests),
        avoid_topics=COALESCE(NULLIF(excluded.avoid_topics, ''), learner_profile.avoid_topics),
        daily_english=COALESCE(NULLIF(excluded.daily_english, ''), learner_profile.daily_english),
        strengths=COALESCE(NULLIF(excluded.strengths, ''), learner_profile.strengths),
        weaknesses=COALESCE(NULLIF(excluded.weaknesses, ''), learner_profile.weaknesses),
        notes=COALESCE(NULLIF(excluded.notes, ''), learner_profile.notes),
        updated_at=datetime('now')
    `).run(
      Number(merged.initialized ?? 1),
      String(merged.name || ''),
      String(merged.l1 || 'zh'),
      String(merged.timezone || 'Asia/Shanghai'),
      String(merged.current_level || ''),
      String(merged.target_level || ''),
      String(merged.target_exam || 'IELTS'),
      merged.exam_date ? String(merged.exam_date) : null,
      Number(merged.daily_minutes ?? 0),
      String(merged.preferred_tone || ''),
      String(merged.study_pattern || ''),
      stringifyMaybe(merged.interests),
      stringifyMaybe(merged.avoid_topics),
      String(merged.daily_english || ''),
      String(merged.strengths || ''),
      String(merged.weaknesses || ''),
      String(merged.notes || ''),
    );
    const row = db.prepare('SELECT * FROM learner_profile WHERE id = 1').get();
    db.exec('COMMIT');
    return { ok: true, action: 'profile_upsert', row };
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  }
}

function upsertActivity(db: ReturnType<typeof getDatabase>, minutes: number, section: string, wordsReviewed: number, newWordsAdded: number): void {
  db.prepare(`
    INSERT INTO activity_log (date, sessions_count, minutes_total, sections_touched, words_reviewed, new_words_added)
    VALUES (date('now'), ?, ?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      sessions_count = activity_log.sessions_count + excluded.sessions_count,
      minutes_total = activity_log.minutes_total + excluded.minutes_total,
      words_reviewed = activity_log.words_reviewed + excluded.words_reviewed,
      new_words_added = activity_log.new_words_added + excluded.new_words_added,
      sections_touched = CASE
        WHEN excluded.sections_touched = '' THEN activity_log.sections_touched
        WHEN activity_log.sections_touched = '' THEN excluded.sections_touched
        WHEN INSTR(activity_log.sections_touched, excluded.sections_touched) > 0 THEN activity_log.sections_touched
        ELSE activity_log.sections_touched || ',' || excluded.sections_touched
      END
  `).run(minutes > 0 ? 1 : 0, Math.max(0, minutes), section, wordsReviewed, newWordsAdded);
}

function upsertBandTrend(db: ReturnType<typeof getDatabase>, section: string, bandOverall: number, source: string): void {
  db.prepare(`
    INSERT INTO band_trend (date, section, band_estimate, sample_count, source)
    VALUES (date('now'), ?, ?, 1, ?)
    ON CONFLICT(date, section) DO UPDATE SET
      band_estimate = ROUND((band_trend.band_estimate * band_trend.sample_count + excluded.band_estimate) / (band_trend.sample_count + 1), 2),
      sample_count = band_trend.sample_count + 1,
      source = excluded.source
  `).run(section, bandOverall, source);
}

function inferSection(skillType: string): string {
  if (skillType.startsWith('listening')) return 'listening';
  if (skillType.startsWith('speaking')) return 'speaking';
  if (skillType.startsWith('writing')) return 'writing';
  if (skillType.startsWith('reading')) return 'reading';
  if (skillType.startsWith('vocab')) return 'vocab';
  return 'other';
}

function optionalNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function severityScore(severity: string): number {
  switch (severity.toLowerCase()) {
    case 'low': return 1;
    case 'high': return 5;
    default: return 3;
  }
}

function parseJsonList<T>(value: unknown, name: string): T[] {
  if (value === undefined || value === null || value === '') return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!Array.isArray(parsed)) throw new Error(`${name} must be an array`);
    return parsed.filter(x => x && typeof x === 'object') as T[];
  } catch {
    throw new Error(`Invalid ${name} JSON — must be an array`);
  }
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null || value === '') return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === 'string') {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  }
  return {};
}

function parseWordEntries(args: Record<string, unknown>): WordEntry[] {
  if (args.words) return parseJsonList<WordEntry>(args.words, 'words');
  if (args.word) return [args as WordEntry];
  return [];
}

function normalizeJsonString(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function stringifyMaybe(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value) || typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function normalizeRowId(value: number | bigint): number {
  return typeof value === 'bigint' ? Number(value) : value;
}

function nowSql(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function nextSrsState(reviewCount: number, oldInterval: number, oldEase: number, rating: number): [number, number] {
  const safeRating = clampInt(rating, 0, 5);
  const ease = Math.max(1.3, oldEase + (0.1 - (5 - safeRating) * (0.08 + (5 - safeRating) * 0.02)));
  if (safeRating < 3) return [1, ease];
  if (reviewCount <= 0) return [1, ease];
  if (reviewCount === 1) return [3, ease];
  if (reviewCount === 2) return [7, ease];
  return [Math.min(90, Math.max(1, Math.round(oldInterval * ease))), ease];
}
