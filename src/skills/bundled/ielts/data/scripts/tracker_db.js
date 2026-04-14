#!/usr/bin/env node
/**
 * tracker_db.js — Node.js SQLite CRUD for Anya IELTS Learning Tracker
 * 
 * Replaces tracker_db.py
 * Tables: samples, errors, sample_words, plan
 * All output is JSON to stdout.
 * Uses node:sqlite (Node 22 built-in).
 */

import { DatabaseSync } from 'node:sqlite';
import { parseArgs } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

// ── Database ─────────────────────────────────────────────────────────────────

function getDbPath() {
  const raw = process.env.LEARNER_DB_PATH || '~/.anya/data/store/learner.db';
  const expanded = raw.startsWith('~') ? path.join(os.homedir(), raw.slice(1)) : raw;
  return path.resolve(expanded);
}

function getConnection() {
  const dbPath = getDbPath();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode=WAL');
  db.exec('PRAGMA foreign_keys=ON');
  return db;
}

function initDb(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS samples (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at      TEXT NOT NULL,
        skill_type      TEXT NOT NULL,
        prompt          TEXT NOT NULL DEFAULT '',
        raw_content     TEXT NOT NULL DEFAULT '',
        band_task       REAL,
        band_coherence  REAL,
        band_lexical    REAL,
        band_grammar    REAL,
        band_overall    REAL,
        audio_path      TEXT,
        session_id      TEXT NOT NULL DEFAULT '',
        feedback        TEXT NOT NULL DEFAULT '',
        difficulty_switches INTEGER NOT NULL DEFAULT 0,
        translation     TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS errors (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        sample_id       INTEGER NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
        recurrence_key  TEXT NOT NULL,
        category        TEXT NOT NULL,
        severity        TEXT NOT NULL DEFAULT 'medium',
        original_phrase TEXT NOT NULL DEFAULT '',
        correction      TEXT NOT NULL DEFAULT '',
        rule_note       TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS sample_words (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        sample_id       INTEGER NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
        word            TEXT NOT NULL,
        usage_type      TEXT NOT NULL DEFAULT 'exposure'
    );

    CREATE TABLE IF NOT EXISTS plan (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        week_start          TEXT NOT NULL,
        primary_focus       TEXT NOT NULL DEFAULT '',
        secondary_focus     TEXT NOT NULL DEFAULT '',
        target_skill        TEXT NOT NULL DEFAULT '',
        suggested_exercises TEXT NOT NULL DEFAULT '',
        created_at          TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_samples_created   ON samples(created_at);
    CREATE INDEX IF NOT EXISTS idx_samples_skill     ON samples(skill_type);
    CREATE INDEX IF NOT EXISTS idx_samples_session   ON samples(session_id);
    CREATE INDEX IF NOT EXISTS idx_errors_sample     ON errors(sample_id);
    CREATE INDEX IF NOT EXISTS idx_errors_key        ON errors(recurrence_key);
    CREATE INDEX IF NOT EXISTS idx_sample_words_sample ON sample_words(sample_id);
    CREATE INDEX IF NOT EXISTS idx_sample_words_word ON sample_words(word);
    CREATE INDEX IF NOT EXISTS idx_plan_week         ON plan(week_start);
  `);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function output(data) {
  console.log(JSON.stringify(data, null, 2));
}

function nowStr() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19).replace(' ', 'T');
}

function rowToDict(row) {
  return row ? { ...row } : null;
}

function floatOrNull(val) {
  if (val === undefined || val === null || val === '') return null;
  const num = parseFloat(val);
  return isNaN(num) ? null : num;
}

// ── Sample Commands ──────────────────────────────────────────────────────────

function cmdAddSample(db, args) {
  const skillType = args.values['skill-type'];
  if (!skillType) throw new Error("Missing --skill-type");

  const now = nowStr();
  const stmt = db.prepare(`
    INSERT INTO samples (created_at, skill_type, prompt, raw_content,
                        band_task, band_coherence, band_lexical, band_grammar, band_overall,
                        audio_path, session_id, feedback, difficulty_switches, translation)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    now,
    skillType,
    args.values.prompt || "",
    args.values['raw-content'] || "",
    floatOrNull(args.values['band-task']),
    floatOrNull(args.values['band-coherence']),
    floatOrNull(args.values['band-lexical']),
    floatOrNull(args.values['band-grammar']),
    floatOrNull(args.values['band-overall']),
    args.values['audio-path'] || null,
    args.values['session-id'] || "",
    args.values.feedback || "",
    parseInt(args.values['difficulty-switches'] || '0', 10),
    args.values.translation || ""
  );

  output({ ok: true, sample_id: result.lastInsertRowid, created_at: now });
}

function cmdGetSample(db, args) {
  const idStr = args.positionals[1];
  if (!idStr) throw new Error("Missing sample ID");
  const id = parseInt(idStr, 10);

  const row = db.prepare("SELECT * FROM samples WHERE id = ?").get(id);
  if (!row) {
    return output({ error: \`Sample \${id} not found.\` });
  }

  const d = rowToDict(row);
  d.errors = db.prepare("SELECT * FROM errors WHERE sample_id = ? ORDER BY id").all(id).map(rowToDict);
  d.words = db.prepare("SELECT * FROM sample_words WHERE sample_id = ? ORDER BY id").all(id).map(rowToDict);

  output(d);
}

function cmdListSamples(db, args) {
  const skillType = args.values['skill-type'];
  const limit = parseInt(args.values.limit || '20', 10);
  const since = args.values.since || "";

  let rows;
  if (skillType && since) {
    rows = db.prepare("SELECT * FROM samples WHERE skill_type = ? AND created_at >= ? ORDER BY created_at DESC LIMIT ?").all(skillType, since, limit);
  } else if (skillType) {
    rows = db.prepare("SELECT * FROM samples WHERE skill_type = ? ORDER BY created_at DESC LIMIT ?").all(skillType, limit);
  } else if (since) {
    rows = db.prepare("SELECT * FROM samples WHERE created_at >= ? ORDER BY created_at DESC LIMIT ?").all(since, limit);
  } else {
    rows = db.prepare("SELECT * FROM samples ORDER BY created_at DESC LIMIT ?").all(limit);
  }

  output({ count: rows.length, samples: rows.map(rowToDict) });
}

// ── Error Commands ───────────────────────────────────────────────────────────

function cmdAddError(db, args) {
  const sampleId = parseInt(args.values['sample-id'], 10);
  if (!sampleId) throw new Error("Missing --sample-id");

  const row = db.prepare("SELECT id FROM samples WHERE id = ?").get(sampleId);
  if (!row) {
    return output({ error: \`Sample \${sampleId} not found.\` });
  }

  const recurrenceKey = args.values['recurrence-key'];
  const category = args.values.category;
  if (!recurrenceKey || !category) throw new Error("Missing --recurrence-key or --category");

  const stmt = db.prepare(`
    INSERT INTO errors (sample_id, recurrence_key, category, severity,
                      original_phrase, correction, rule_note)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    sampleId,
    recurrenceKey,
    category,
    args.values.severity || "medium",
    args.values['original-phrase'] || "",
    args.values.correction || "",
    args.values['rule-note'] || ""
  );

  output({ ok: true, error_id: result.lastInsertRowid });
}

function cmdListErrors(db, args) {
  const limit = parseInt(args.values.limit || '50', 10);
  const recurrenceKey = args.values['recurrence-key'];

  let rows;
  if (recurrenceKey) {
    rows = db.prepare(\`
      SELECT e.*, s.skill_type, s.created_at as sample_date 
      FROM errors e JOIN samples s ON e.sample_id = s.id 
      WHERE e.recurrence_key = ? ORDER BY s.created_at DESC LIMIT ?
    \`).all(recurrenceKey, limit);
  } else {
    rows = db.prepare(\`
      SELECT e.*, s.skill_type, s.created_at as sample_date 
      FROM errors e JOIN samples s ON e.sample_id = s.id 
      ORDER BY s.created_at DESC LIMIT ?
    \`).all(limit);
  }

  output({ count: rows.length, errors: rows.map(rowToDict) });
}

function cmdErrorStats(db, args) {
  const limit = parseInt(args.values.limit || '20', 10);
  const rows = db.prepare(\`
    SELECT recurrence_key, category, COUNT(*) as count, MAX(s.created_at) as last_seen
    FROM errors e JOIN samples s ON e.sample_id = s.id
    GROUP BY recurrence_key
    ORDER BY count DESC
    LIMIT ?
  \`).all(limit);

  output({ stats: rows.map(rowToDict) });
}

// ── Sample Words Commands ────────────────────────────────────────────────────

function cmdAddWord(db, args) {
  const sampleId = parseInt(args.values['sample-id'], 10);
  const word = args.values.word?.toLowerCase();
  if (!sampleId || !word) throw new Error("Missing --sample-id or --word");

  const row = db.prepare("SELECT id FROM samples WHERE id = ?").get(sampleId);
  if (!row) {
    return output({ error: \`Sample \${sampleId} not found.\` });
  }

  const result = db.prepare("INSERT INTO sample_words (sample_id, word, usage_type) VALUES (?, ?, ?)")
    .run(sampleId, word, args.values['usage-type'] || 'exposure');
  
  output({ ok: true, id: result.lastInsertRowid });
}

function cmdAddWordsBatch(db, args) {
  const sampleId = parseInt(args.values['sample-id'], 10);
  const wordsRaw = args.values.words;
  if (!sampleId || !wordsRaw) throw new Error("Missing --sample-id or --words");

  const row = db.prepare("SELECT id FROM samples WHERE id = ?").get(sampleId);
  if (!row) {
    return output({ error: \`Sample \${sampleId} not found.\` });
  }

  const words = wordsRaw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const usageType = args.values['usage-type'] || 'exposure';

  const stmt = db.prepare("INSERT INTO sample_words (sample_id, word, usage_type) VALUES (?, ?, ?)");
  for (const w of words) {
    stmt.run(sampleId, w, usageType);
  }

  output({ ok: true, count: words.length, words });
}

// ── Plan Commands ────────────────────────────────────────────────────────────

function cmdAddPlan(db, args) {
  const weekStart = args.values['week-start'];
  if (!weekStart) throw new Error("Missing --week-start");

  const now = nowStr();
  const stmt = db.prepare(\`
    INSERT INTO plan (week_start, primary_focus, secondary_focus, target_skill, suggested_exercises, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  \`);

  const result = stmt.run(
    weekStart,
    args.values['primary-focus'] || "",
    args.values['secondary-focus'] || "",
    args.values['target-skill'] || "",
    args.values['suggested-exercises'] || "",
    now
  );

  output({ ok: true, plan_id: result.lastInsertRowid, created_at: now });
}

function cmdGetPlan(db, args) {
  const weekStart = args.values['week-start'];
  let row;
  if (weekStart) {
    row = db.prepare("SELECT * FROM plan WHERE week_start = ? ORDER BY created_at DESC LIMIT 1").get(weekStart);
  } else {
    row = db.prepare("SELECT * FROM plan ORDER BY created_at DESC LIMIT 1").get();
  }

  if (!row) {
    return output({ error: "No plan found." });
  }
  output(rowToDict(row));
}

function cmdListPlans(db, args) {
  const limit = parseInt(args.values.limit || '10', 10);
  const rows = db.prepare("SELECT * FROM plan ORDER BY week_start DESC LIMIT ?").all(limit);
  output({ count: rows.length, plans: rows.map(rowToDict) });
}

// ── Stats Commands ───────────────────────────────────────────────────────────

function cmdStats(db, args) {
  const total = db.prepare("SELECT COUNT(*) as c FROM samples").get().c;
  
  const bySkill = db.prepare(\`
    SELECT skill_type, COUNT(*) as count, AVG(band_overall) as avg_band
    FROM samples WHERE band_overall IS NOT NULL GROUP BY skill_type
  \`).all().map(rowToDict);

  const totalErrors = db.prepare("SELECT COUNT(*) as c FROM errors").get().c;
  const totalWords = db.prepare("SELECT COUNT(*) as c FROM sample_words").get().c;

  const recent = db.prepare(\`
    SELECT AVG(band_overall) as avg_band, COUNT(*) as count
    FROM samples WHERE created_at >= date('now', '-7 days') AND band_overall IS NOT NULL
  \`).get();

  output({
    total_samples: total,
    total_errors: totalErrors,
    total_words_tracked: totalWords,
    by_skill: bySkill,
    last_7_days: {
      avg_band: recent.avg_band ? Number(recent.avg_band.toFixed(1)) : null,
      sample_count: recent.count
    }
  });
}

function cmdBandHistory(db, args) {
  const skillType = args.values['skill-type'];
  const limit = parseInt(args.values.limit || '20', 10);

  let rows;
  if (skillType) {
    rows = db.prepare(\`
      SELECT created_at, band_task, band_coherence, band_lexical, band_grammar, band_overall
      FROM samples WHERE skill_type = ? AND band_overall IS NOT NULL ORDER BY created_at DESC LIMIT ?
    \`).all(skillType, limit);
  } else {
    rows = db.prepare(\`
      SELECT created_at, skill_type, band_task, band_coherence, band_lexical, band_grammar, band_overall
      FROM samples WHERE band_overall IS NOT NULL ORDER BY created_at DESC LIMIT ?
    \`).all(limit);
  }

  output({ count: rows.length, history: rows.map(rowToDict) });
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function main() {
  const options = {
    'skill-type': { type: 'string' },
    prompt: { type: 'string' },
    'raw-content': { type: 'string' },
    'band-task': { type: 'string' },
    'band-coherence': { type: 'string' },
    'band-lexical': { type: 'string' },
    'band-grammar': { type: 'string' },
    'band-overall': { type: 'string' },
    'audio-path': { type: 'string' },
    'session-id': { type: 'string' },
    feedback: { type: 'string' },
    'difficulty-switches': { type: 'string' },
    translation: { type: 'string' },
    since: { type: 'string' },
    limit: { type: 'string' },
    'sample-id': { type: 'string' },
    'recurrence-key': { type: 'string' },
    category: { type: 'string' },
    severity: { type: 'string' },
    'original-phrase': { type: 'string' },
    correction: { type: 'string' },
    'rule-note': { type: 'string' },
    word: { type: 'string' },
    'usage-type': { type: 'string' },
    words: { type: 'string' },
    'week-start': { type: 'string' },
    'primary-focus': { type: 'string' },
    'secondary-focus': { type: 'string' },
    'target-skill': { type: 'string' },
    'suggested-exercises': { type: 'string' },
  };

  const args = parseArgs({ args: process.argv.slice(2), options, allowPositionals: true });
  const command = args.positionals[0];

  if (!command) {
    console.error("Missing command.");
    process.exit(1);
  }

  let db;
  try {
    db = getConnection();
    initDb(db);
  } catch (e) {
    output({ error: \`Database connection failed: \${e.message}\` });
    process.exit(1);
  }

  const dispatch = {
    'add-sample': cmdAddSample, 'get-sample': cmdGetSample, 'list-samples': cmdListSamples,
    'add-error': cmdAddError, 'list-errors': cmdListErrors, 'error-stats': cmdErrorStats,
    'add-word': cmdAddWord, 'add-words-batch': cmdAddWordsBatch,
    'add-plan': cmdAddPlan, 'get-plan': cmdGetPlan, 'list-plans': cmdListPlans,
    stats: cmdStats, 'band-history': cmdBandHistory,
  };

  try {
    if (dispatch[command]) {
      dispatch[command](db, args);
    } else {
      output({ error: \`Unknown command '\${command}'\` });
    }
  } catch (e) {
    output({ error: \`Command '\${command}' failed: \${e.message}\` });
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
