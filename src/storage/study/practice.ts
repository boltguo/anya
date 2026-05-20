import type { DatabaseSync } from 'node:sqlite';
import {
  type ErrorEntry, type SubcapEntry,
  withTransaction, optionalNumber, normalizeRowId, normalizeJsonString,
  inferSection, severityScore, parseJsonList,
  isValidErrorKey, clampInt,
} from './helpers.js';
import { ensureActiveStudySession } from './session.js';

const ABANDONED_PROMPT = '[abandoned]';
const ABANDONED_RESPONSE = '[abandoned]';
const ABANDONED_FEEDBACK = 'Session abandoned before evaluation.';

const VALID_ASSISTANCE = new Set(['none', 'hint', 'outline', 'sos', 'redo']);
const VALID_MODES = new Set(['study', 'placement']);

export function logPractice(db: DatabaseSync, args: Record<string, unknown>): unknown {
  const skillType = String(args.skill_type || '');
  if (!skillType) return { error: 'Missing skill_type' };

  const completed = Number(args.completed ?? 1);

  const placeholderOk = completed === 0;
  const rawPrompt = String(args.prompt ?? '').trim();
  const rawResponse = String(args.response ?? args.raw_content ?? '').trim();
  const rawFeedback = String(args.feedback ?? '').trim();

  const prompt = rawPrompt || (placeholderOk ? ABANDONED_PROMPT : '');
  const response = rawResponse || (placeholderOk ? ABANDONED_RESPONSE : '');
  const feedback = rawFeedback || (placeholderOk ? ABANDONED_FEEDBACK : '');

  if (!prompt) return { error: 'Missing prompt' };
  if (!response) return { error: 'Missing response' };
  if (!feedback) return { error: 'Missing feedback' };

  const sessionId = String(args.session_id || '');
  let studySessionId = optionalNumber(args.study_session_id);
  if (studySessionId === null && sessionId) {
    studySessionId = ensureActiveStudySession(db, sessionId, 'auto');
  }
  const accuracy = optionalNumber(args.accuracy);
  const rawScore = optionalNumber(args.raw_score);
  const maxScore = optionalNumber(args.max_score);
  const audioPath = args.audio_path ? String(args.audio_path) : null;
  const modeRaw = String(args.mode || 'study');
  const mode = VALID_MODES.has(modeRaw) ? modeRaw : 'study';
  const section = String(args.section || inferSection(skillType));
  const minutes = Number(args.minutes ?? 1);
  const bandOverall = optionalNumber(args.band_overall);
  const assistanceRaw = String(args.assistance_level || 'none').toLowerCase();
  const assistance = VALID_ASSISTANCE.has(assistanceRaw) ? assistanceRaw : 'none';

  const rawErrors = parseJsonList<ErrorEntry>(args.errors, 'errors');
  const rawSubcaps = parseJsonList<SubcapEntry>(args.subcap_scores, 'subcap_scores');

  // Validate error keys against the canonical whitelist before opening
  // a transaction; failing fast gives the caller a clear error message.
  const unknownKeys: string[] = [];
  const validErrors: ErrorEntry[] = [];
  for (const e of rawErrors) {
    const key = String(e.key || '').trim();
    if (!key) continue;
    if (!isValidErrorKey(db, key)) {
      unknownKeys.push(key);
      continue;
    }
    validErrors.push({ ...e, key });
  }

  return withTransaction(db, () => {
    const sampleStmt = db.prepare(`
      INSERT INTO samples (
        created_at, session_id, study_session_id,
        skill_type, section, prompt, response,
        accuracy, raw_score, max_score, feedback, mode, completed,
        audio_path, minutes, band_overall,
        parent_sample_id, assistance_level, prompt_hash, metadata
      ) VALUES (
        datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `);
    const sampleResult = sampleStmt.run(
      sessionId, studySessionId,
      skillType, section, prompt, response,
      accuracy, rawScore, maxScore, feedback, mode, completed,
      audioPath, minutes, bandOverall,
      optionalNumber(args.parent_sample_id), assistance,
      String(args.prompt_hash || ''), normalizeJsonString(args.metadata),
    );
    const sampleId = normalizeRowId(sampleResult.lastInsertRowid);

    // Errors → errors + error_patterns (incremental counters only).
    const errorStmt = db.prepare(`
      INSERT INTO errors (sample_id, recurrence_key, category, severity, original_phrase, correction, rule_note)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const patternStmt = db.prepare(`
      INSERT INTO error_patterns (
        recurrence_key, category, severity_score, seen_count, last_seen_at, rule_note
      ) VALUES (?, ?, ?, 1, datetime('now'), ?)
      ON CONFLICT(recurrence_key) DO UPDATE SET
        category = excluded.category,
        severity_score = MAX(error_patterns.severity_score, excluded.severity_score),
        seen_count = error_patterns.seen_count + 1,
        last_seen_at = excluded.last_seen_at,
        rule_note = excluded.rule_note
    `);
    for (const e of validErrors) {
      const key = e.key;
      const category = String(e.category || section);
      const severity = String(e.severity || 'medium');
      errorStmt.run(
        sampleId, key, category, severity,
        String(e.original || ''), String(e.correction || ''), String(e.note || ''),
      );
      patternStmt.run(key, category, severityScore(severity), String(e.note || ''));
    }

    // Subcaps on canonical 0-10 scale. Nothing derived stored here.
    const subcapStmt = db.prepare(`
      INSERT INTO subcap_scores (sample_id, subcap_key, value, evidence, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `);
    for (const s of rawSubcaps) {
      const key = String(s.key || '').trim();
      if (!key) continue;
      const value = Number(s.value ?? s.score ?? 0);
      subcapStmt.run(sampleId, key, Number.isFinite(value) ? value : 0, String(s.evidence || ''));
    }

    return {
      ok: true,
      action: 'practice',
      sample_id: sampleId,
      errors_count: validErrors.length,
      subcaps_count: rawSubcaps.length,
      ...(unknownKeys.length > 0 ? { unknown_error_keys: unknownKeys } : {}),
    };
  });
}

export function recentPractice(db: DatabaseSync, args: Record<string, unknown>): unknown {
  const scopeRaw = String(args.scope || 'session').toLowerCase();
  const scope = scopeRaw === 'global' ? 'global' : 'session';
  const sessionId = String(args.session_id || '');
  const skillType = String(args.skill_type || '');
  const limit = clampInt(Number(args.limit ?? 5), 1, 50);
  const days = clampInt(Number(args.days ?? (scope === 'global' ? 30 : 365)), 1, 365);
  const includeAbandoned = args.include_abandoned === undefined
    ? true
    : Number(args.include_abandoned) === 1 || args.include_abandoned === true;

  if (scope === 'session' && !sessionId) return { error: 'Missing session_id for scope=session' };

  const where: string[] = [];
  const params: (string | number)[] = [];
  if (scope === 'session') {
    where.push('session_id = ?');
    params.push(sessionId);
  } else {
    where.push("created_at >= datetime('now', ?)");
    params.push(`-${days} days`);
  }
  if (skillType) {
    where.push('skill_type = ?');
    params.push(skillType);
  }
  if (!includeAbandoned) where.push('completed = 1');
  params.push(limit);

  const rows = db.prepare(`
    SELECT id, created_at, skill_type, completed, accuracy, raw_score, max_score,
           prompt, prompt_hash, parent_sample_id, assistance_level, mode,
           band_overall, metadata
    FROM samples
    WHERE ${where.join(' AND ')}
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `).all(...params) as Array<Record<string, unknown>>;

  const decoded: Array<Record<string, unknown>> = rows.map((r) => {
    const raw = String(r.metadata ?? '');
    let meta: unknown = null;
    if (raw.length > 0) {
      try { meta = JSON.parse(raw); } catch { meta = raw; }
    }
    return { ...r, metadata: meta };
  });

  const recent_prompt_hashes = decoded
    .map((r) => String(r.prompt_hash ?? ''))
    .filter((h) => h.length > 0);

  return {
    ok: true,
    action: 'recent_practice',
    scope,
    rows: decoded,
    count: decoded.length,
    recent_prompt_hashes,
  };
}
