#!/usr/bin/env node
/**
 * vocab_db.js — Node.js SQLite CRUD for Anya IELTS Vocabulary Notebook
 * 
 * Replaces vocab_db.py
 * All output is JSON to stdout.
 * Uses node:sqlite (Node 22 built-in).
 */

import { DatabaseSync } from 'node:sqlite';
import { parseArgs } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

// ── Constants ────────────────────────────────────────────────────────────────

const ACTIVE_QUEUE_LIMIT = 60;
const LEITNER_INTERVALS = [1, 3, 7, 14, 30]; // days per box (box 1-5)

const DECAY_CORRECT_TARGET = 0.7;
const DECAY_WRONG_TARGET = 1.5;
const DECAY_ALPHA = 0.3; // EMA smoothing factor

const MASTERY_WEIGHTS = {
  recognition: 0.25,
  production: 0.35,
  exposure_diversity: 0.15,
  retention_stability: 0.15,
  recency: 0.10,
};

// ── Database ─────────────────────────────────────────────────────────────────

function getDbPath() {
  const raw = process.env.VOCAB_DB_PATH || '~/.anya/data/store/vocab.db';
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
    CREATE TABLE IF NOT EXISTS words (
        word              TEXT PRIMARY KEY,
        added_at          TEXT NOT NULL,
        source            TEXT NOT NULL DEFAULT 'manual',
        definition        TEXT NOT NULL DEFAULT '',
        chinese           TEXT NOT NULL DEFAULT '',
        ipa               TEXT NOT NULL DEFAULT '',
        pos               TEXT NOT NULL DEFAULT '',
        collocations      TEXT NOT NULL DEFAULT '[]',
        topics            TEXT NOT NULL DEFAULT '[]',
        user_example      TEXT NOT NULL DEFAULT '',
        user_example_source TEXT NOT NULL DEFAULT '',
        user_example_date TEXT NOT NULL DEFAULT '',
        box               INTEGER NOT NULL DEFAULT 1,
        next_review       TEXT NOT NULL,
        last_review       TEXT NOT NULL DEFAULT '',
        last_review_result TEXT NOT NULL DEFAULT '',
        exposure_count    INTEGER NOT NULL DEFAULT 0,
        production_count  INTEGER NOT NULL DEFAULT 0,
        last_used         TEXT NOT NULL DEFAULT '',
        decay_rate        REAL NOT NULL DEFAULT 1.0,
        mastery_score     REAL NOT NULL DEFAULT 0.0,
        recognition_correct INTEGER NOT NULL DEFAULT 0,
        recognition_total   INTEGER NOT NULL DEFAULT 0,
        is_mastered       INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS review_history (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        word        TEXT NOT NULL REFERENCES words(word) ON DELETE CASCADE,
        review_date TEXT NOT NULL,
        quiz_type   TEXT NOT NULL,
        result      TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS usage_events (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        word         TEXT NOT NULL REFERENCES words(word) ON DELETE CASCADE,
        event_date   TEXT NOT NULL,
        event_type   TEXT NOT NULL,
        session_type TEXT NOT NULL DEFAULT '',
        context      TEXT NOT NULL DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_words_next_review   ON words(next_review);
    CREATE INDEX IF NOT EXISTS idx_words_mastery       ON words(mastery_score);
    CREATE INDEX IF NOT EXISTS idx_words_added         ON words(added_at);
    CREATE INDEX IF NOT EXISTS idx_words_mastered      ON words(is_mastered);
    CREATE INDEX IF NOT EXISTS idx_usage_word          ON usage_events(word);
    CREATE INDEX IF NOT EXISTS idx_review_word         ON review_history(word);
  `);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function output(data) {
  console.log(JSON.stringify(data, null, 2));
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function addDays(dateStr, days) {
  const d = dateStr ? new Date(dateStr) : new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function diffDays(dateStr) {
  const diffTime = Math.abs(new Date() - new Date(dateStr));
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
}

function rowToDict(row) {
  if (!row) return null;
  const d = { ...row };
  for (const key of ['collocations', 'topics']) {
    if (typeof d[key] === 'string') {
      try {
        d[key] = JSON.parse(d[key]);
      } catch {
        d[key] = [];
      }
    }
  }
  return d;
}

function wordSummary(d) {
  return {
    word: d.word,
    chinese: d.chinese,
    box: d.box,
    mastery_score: d.mastery_score,
    next_review: d.next_review,
    production_count: d.production_count,
    exposure_count: d.exposure_count,
    is_mastered: Boolean(d.is_mastered),
  };
}

// ── Mastery Calculation ──────────────────────────────────────────────────────

function computeMastery(row) {
  let recognition = 0;
  if (row.recognition_total > 0) {
    recognition = (row.recognition_correct / row.recognition_total) * 100;
  }

  const production = Math.min(row.production_count * 10, 100);
  const exposure = Math.min(row.exposure_count * 5, 100);
  
  const decay = row.decay_rate || 1.0;
  const retention = Math.max(0, Math.min(100, (1.5 - decay) / 0.8 * 100));

  let recency = 0.0;
  if (row.last_used) {
    const daysAgo = diffDays(row.last_used);
    recency = Math.max(0, 100 - daysAgo * 3.33);
  }

  let raw = (
    MASTERY_WEIGHTS.recognition * recognition +
    MASTERY_WEIGHTS.production * production +
    MASTERY_WEIGHTS.exposure_diversity * exposure +
    MASTERY_WEIGHTS.retention_stability * retention +
    MASTERY_WEIGHTS.recency * recency
  );

  if (row.production_count === 0) {
    raw = Math.min(raw, 50.0);
  }

  return Number(raw.toFixed(1));
}

function calcNextReview(box, decayRate) {
  const idx = Math.max(0, Math.min(box - 1, LEITNER_INTERVALS.length - 1));
  const baseDays = LEITNER_INTERVALS[idx];
  const actualDays = Math.max(1, Math.round(baseDays * decayRate));
  return addDays(null, actualDays);
}

// ── Commands ─────────────────────────────────────────────────────────────────

function cmdAdd(db, args) {
  const word = args.values.word?.toLowerCase();
  if (!word) throw new Error('Missing --word');

  const countRow = db.prepare("SELECT COUNT(*) as cnt FROM words WHERE is_mastered = 0").get();
  if (countRow.cnt >= ACTIVE_QUEUE_LIMIT) {
    return output({ error: \`Active queue full (\${ACTIVE_QUEUE_LIMIT} words). Master or delete words first.\` });
  }

  const existing = db.prepare("SELECT word FROM words WHERE word = ?").get(word);
  if (existing) {
    return output({ error: \`Word '\${word}' already exists. Use 'get' to view it.\` });
  }

  const collocations = JSON.stringify((args.values.collocations || '').split(',').map(s=>s.trim()).filter(Boolean));
  const topics = JSON.stringify((args.values.topics || '').split(',').map(s=>s.trim()).filter(Boolean));
  const tomorrow = addDays(null, 1);
  const today = todayStr();

  db.prepare(\`
    INSERT INTO words (word, added_at, source, definition, chinese, ipa, pos,
                       collocations, topics, user_example, next_review)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  \`).run(
    word, today, args.values.source || 'manual', args.values.definition || '',
    args.values.chinese || '', args.values.ipa || '', args.values.pos || '',
    collocations, topics, args.values.example || '', tomorrow
  );

  output({ ok: true, word, next_review: tomorrow, box: 1 });
}

function cmdGet(db, args) {
  const word = args.positionals[1]?.toLowerCase();
  if (!word) throw new Error("Missing word argument");

  const row = db.prepare("SELECT * FROM words WHERE word = ?").get(word);
  if (!row) return output({ error: \`Word '\${word}' not found.\` });

  const d = rowToDict(row);
  d.review_history = db.prepare("SELECT review_date, quiz_type, result FROM review_history WHERE word = ? ORDER BY review_date DESC LIMIT 20").all(word);
  d.usage_events = db.prepare("SELECT event_date, event_type, session_type, context FROM usage_events WHERE word = ? ORDER BY event_date DESC LIMIT 20").all(word);
  
  d.mastery_score = computeMastery(d);
  output(d);
}

function cmdLookup(db, args) {
  const word = args.positionals[1]?.toLowerCase();
  if (!word) throw new Error("Missing word argument");
  const row = db.prepare("SELECT word, definition, chinese, ipa, pos, mastery_score, box, next_review, production_count FROM words WHERE word = ?").get(word);
  if (!row) return output({ error: \`Word '\${word}' not found.\` });
  output(row);
}

function cmdList(db, args) {
  const subcommand = args.positionals[1];
  const limit = args.values.limit ? parseInt(args.values.limit, 10) : 10;
  const today = todayStr();
  
  let rows = [];
  if (subcommand === 'due') {
    rows = db.prepare("SELECT * FROM words WHERE next_review <= ? AND is_mastered = 0 ORDER BY next_review ASC LIMIT ?").all(today, limit);
  } else if (subcommand === 'stuck') {
    const days = parseInt(args.values.days || '14', 10);
    const cutoff = addDays(null, -days);
    rows = db.prepare("SELECT * FROM words WHERE added_at <= ? AND mastery_score < 50 AND is_mastered = 0 ORDER BY mastery_score ASC LIMIT ?").all(cutoff, limit);
  } else if (subcommand === 'new') {
    const days = parseInt(args.values.days || '7', 10);
    const cutoff = addDays(null, -days);
    rows = db.prepare("SELECT * FROM words WHERE added_at >= ? AND is_mastered = 0 ORDER BY added_at DESC LIMIT ?").all(cutoff, limit);
  } else if (subcommand === 'mastered') {
    rows = db.prepare("SELECT * FROM words WHERE is_mastered = 1 ORDER BY mastery_score DESC LIMIT ?").all(limit);
  } else if (subcommand === 'topic') {
    const tag = args.values.tag;
    if (!tag) return output({ error: "Missing --tag for topic list." });
    rows = db.prepare("SELECT * FROM words WHERE topics LIKE ? AND is_mastered = 0 ORDER BY mastery_score ASC LIMIT ?").all(\`%"\${tag}"%\`, limit);
  } else {
    return output({ error: \`Unknown list type: \${subcommand}\` });
  }

  const results = rows.map(r => wordSummary(rowToDict(r)));
  output({ count: results.length, words: results });
}

function cmdQuiz(db, args) {
  const word = args.positionals[1]?.toLowerCase();
  if (!word) throw new Error("Missing word");
  
  const row = db.prepare("SELECT * FROM words WHERE word = ?").get(word);
  if (!row) return output({ error: \`Word '\${word}' not found.\` });
  
  const d = rowToDict(row);
  const today = todayStr();

  if (d.added_at === today && d.recognition_total === 0) {
    return output({ error: \`Word '\${word}' was added today. First review is tomorrow.\` });
  }

  const result = args.values.result;
  const quizType = args.values.type || 'definition';
  db.prepare("INSERT INTO review_history (word, review_date, quiz_type, result) VALUES (?, ?, ?, ?)").run(word, today, quizType, result);

  const newTotal = d.recognition_total + 1;
  const newCorrect = d.recognition_correct + (result === 'correct' ? 1 : 0);

  let decay = d.decay_rate;
  if (result === 'correct') {
    decay = decay * (1 - DECAY_ALPHA) + DECAY_CORRECT_TARGET * DECAY_ALPHA;
  } else if (result === 'wrong') {
    decay = decay * (1 - DECAY_ALPHA) + DECAY_WRONG_TARGET * DECAY_ALPHA;
  }

  let box = d.box;
  if (result === 'correct') {
    box = Math.min(box + 1, 5);
  } else if (result === 'wrong') {
    box = Math.max(box - 1, 1);
  }

  const nextReview = calcNextReview(box, decay);
  
  const updated = { ...d, recognition_total: newTotal, recognition_correct: newCorrect, decay_rate: decay, box: box };
  const mastery = computeMastery(updated);

  db.prepare(\`
    UPDATE words SET
      recognition_total = ?, recognition_correct = ?, decay_rate = ?, box = ?, next_review = ?,
      last_review = ?, last_review_result = ?, mastery_score = ?
    WHERE word = ?
  \`).run(newTotal, newCorrect, decay.toFixed(4), box, nextReview, today, result, mastery, word);

  output({
    ok: true, word, result, box, decay_rate: Number(decay.toFixed(4)), next_review: nextReview,
    mastery_score: mastery, recognition: \`\${newCorrect}/\${newTotal}\`
  });
}

function cmdUse(db, args) {
  const word = args.positionals[1]?.toLowerCase();
  if (!word) throw new Error("Missing word");
  
  const row = db.prepare("SELECT * FROM words WHERE word = ?").get(word);
  if (!row) return output({ error: \`Word '\${word}' not found.\` });

  const d = rowToDict(row);
  const today = todayStr();
  const eventType = args.values.event;
  
  db.prepare("INSERT INTO usage_events (word, event_date, event_type, session_type, context) VALUES (?, ?, ?, ?, ?)").run(
    word, today, eventType, args.values['session-type'] || '', args.values.context || ''
  );

  const exposure = d.exposure_count + 1;
  const production = d.production_count + (eventType === 'production' ? 1 : 0);

  const updated = { ...d, exposure_count: exposure, production_count: production, last_used: today };
  const mastery = computeMastery(updated);

  db.prepare("UPDATE words SET exposure_count = ?, production_count = ?, last_used = ?, mastery_score = ? WHERE word = ?").run(
    exposure, production, today, mastery, word
  );

  output({ ok: true, word, event: eventType, exposure_count: exposure, production_count: production, mastery_score: mastery });
}

function cmdInject(db, args) {
  const limit = parseInt(args.values.limit || '3', 10);
  const topic = args.values.topic || '';
  const today = todayStr();
  
  let rows = [];
  if (topic) {
    rows = db.prepare(\`SELECT * FROM words WHERE next_review <= ? AND is_mastered = 0 AND topics LIKE ? ORDER BY production_count ASC, mastery_score ASC LIMIT ?\`).all(today, \`%"\${topic}"%\`, limit);
  } else {
    rows = db.prepare(\`SELECT * FROM words WHERE next_review <= ? AND is_mastered = 0 ORDER BY production_count ASC, mastery_score ASC LIMIT ?\`).all(today, limit);
  }

  if (rows.length < limit && topic) {
    const existing = rows.map(r => r.word);
    const placeholders = existing.map(()=>'?').join(',');
    const qStr = \`SELECT * FROM words WHERE next_review <= ? AND is_mastered = 0 \${existing.length ? \`AND word NOT IN (\${placeholders})\` : ''} ORDER BY production_count ASC, mastery_score ASC LIMIT ?\`;
    const params = [today, ...existing, limit - rows.length];
    const extra = db.prepare(qStr).all(...params);
    rows = [...rows, ...extra];
  }

  const results = rows.map(r => {
    const d = rowToDict(r);
    return {
      word: d.word, definition: d.definition, chinese: d.chinese, pos: d.pos,
      collocations: d.collocations, production_count: d.production_count, mastery_score: d.mastery_score
    };
  });

  output({ count: results.length, injected_words: results });
}

function cmdMaster(db, args) {
  const word = args.positionals[1]?.toLowerCase();
  if (!word) throw new Error("Missing word");
  const row = db.prepare("SELECT * FROM words WHERE word = ?").get(word);
  if (!row) return output({ error: \`Word '\${word}' not found.\` });

  const d = rowToDict(row);
  if (d.production_count === 0) {
    return output({ error: \`Cannot master '\${word}' — production_count is 0. Use it in writing or speaking first.\`});
  }

  const resurface = addDays(null, 90);
  db.prepare("UPDATE words SET is_mastered = 1, mastery_score = 100.0, next_review = ? WHERE word = ?").run(resurface, word);
  output({ ok: true, word, is_mastered: true, resurface_check: resurface });
}

function cmdDelete(db, args) {
  const word = args.positionals[1]?.toLowerCase();
  if (!word) throw new Error("Missing word");
  const row = db.prepare("SELECT word FROM words WHERE word = ?").get(word);
  if (!row) return output({ error: \`Word '\${word}' not found.\` });
  db.prepare("DELETE FROM words WHERE word = ?").run(word);
  output({ ok: true, word, deleted: true });
}

function cmdStats(db, args) {
  const total = db.prepare("SELECT COUNT(*) as c FROM words").get().c;
  const active = db.prepare("SELECT COUNT(*) as c FROM words WHERE is_mastered = 0").get().c;
  const mastered = db.prepare("SELECT COUNT(*) as c FROM words WHERE is_mastered = 1").get().c;
  const due_today = db.prepare("SELECT COUNT(*) as c FROM words WHERE next_review <= ? AND is_mastered = 0").get(todayStr()).c;
  const avg_mastery = db.prepare("SELECT AVG(mastery_score) as avg FROM words WHERE is_mastered = 0").get().avg || 0.0;
  const zero_production = db.prepare("SELECT COUNT(*) as c FROM words WHERE production_count = 0 AND is_mastered = 0").get().c;
  const reviews_total = db.prepare("SELECT COUNT(*) as c FROM review_history").get().c;
  const productions_total = db.prepare("SELECT COUNT(*) as c FROM usage_events WHERE event_type = 'production'").get().c;

  const boxes = {};
  for (let i = 1; i <= 5; i++) {
    boxes[\`box_\${i}\`] = db.prepare("SELECT COUNT(*) as c FROM words WHERE box = ? AND is_mastered = 0").get(i).c;
  }

  output({
    total_words: total, active, mastered, due_today, avg_mastery: Number(avg_mastery.toFixed(1)),
    zero_production, total_reviews: reviews_total, total_productions: productions_total, box_distribution: boxes
  });
}

function cmdDump(db, args) {
  const rows = db.prepare("SELECT * FROM words ORDER BY added_at ASC").all();
  output({ count: rows.length, words: rows.map(rowToDict) });
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function main() {
  const options = {
    word: { type: 'string' },
    definition: { type: 'string' },
    chinese: { type: 'string' },
    ipa: { type: 'string' },
    pos: { type: 'string' },
    collocations: { type: 'string' },
    topics: { type: 'string' },
    source: { type: 'string' },
    example: { type: 'string' },
    limit: { type: 'string' },
    days: { type: 'string' },
    tag: { type: 'string' },
    type: { type: 'string' },
    result: { type: 'string' },
    event: { type: 'string' },
    'session-type': { type: 'string' },
    context: { type: 'string' },
    topic: { type: 'string' },
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
    output({ error: \`Database connection failed: \${e.message}\`});
    process.exit(1);
  }

  const dispatch = {
    add: cmdAdd, get: cmdGet, lookup: cmdLookup, list: cmdList,
    quiz: cmdQuiz, use: cmdUse, inject: cmdInject, master: cmdMaster,
    delete: cmdDelete, stats: cmdStats, dump: cmdDump
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
