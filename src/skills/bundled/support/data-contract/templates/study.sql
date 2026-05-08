-- study.db — canonical English learning schema.
--
-- Design principle:
--   Keep only tables needed by the current learning loop:
--   profile -> plan -> practice -> errors/subcaps -> vocab/SRS -> trends.
--
-- Runtime conversation history stays in state.db. Long-lived learner data
-- belongs here, not in USER.md / MEMORY.md. Markdown files constrain the
-- agent; this database is the source of truth for learner facts and evidence.

PRAGMA foreign_keys = ON;

-- ─── 1. Learner profile ───────────────────────────────────────────────────
-- Stable structured user data collected during onboarding or profile edits.
-- USER.md may summarize this for prompt context, but this table is the source
-- of truth for targets, level, schedule, preferences, and durable notes.
CREATE TABLE IF NOT EXISTS learner_profile (
    id                  INTEGER PRIMARY KEY CHECK (id = 1),
    initialized         INTEGER NOT NULL DEFAULT 0,
    name                TEXT NOT NULL DEFAULT '',
    l1                  TEXT NOT NULL DEFAULT 'zh',
    timezone            TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    current_level       TEXT NOT NULL DEFAULT '',       -- CEFR or coarse level
    target_level        TEXT NOT NULL DEFAULT '',
    target_exam         TEXT NOT NULL DEFAULT 'IELTS',
    exam_date           TEXT,                           -- YYYY-MM-DD
    daily_minutes       INTEGER NOT NULL DEFAULT 30,
    preferred_tone      TEXT NOT NULL DEFAULT '',
    study_pattern       TEXT NOT NULL DEFAULT '',
    interests           TEXT NOT NULL DEFAULT '',       -- JSON array or comma text
    avoid_topics        TEXT NOT NULL DEFAULT '',       -- JSON array or comma text
    daily_english       TEXT NOT NULL DEFAULT '',       -- real-life use cases
    strengths           TEXT NOT NULL DEFAULT '',
    weaknesses          TEXT NOT NULL DEFAULT '',
    notes               TEXT NOT NULL DEFAULT '',
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── 2. Daily plan ────────────────────────────────────────────────────────
-- Planned study slots for a date. The router/menu reads this table to show
-- what to do next; practice completion can link back to the produced sample.
CREATE TABLE IF NOT EXISTS daily_tasks (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    date                TEXT NOT NULL,                  -- YYYY-MM-DD
    domain              TEXT NOT NULL DEFAULT '',       -- listening | speaking | reading | writing | vocab | coaching
    task_type           TEXT NOT NULL,                  -- primary | review | consolidation | challenge
    skill               TEXT NOT NULL,                  -- concrete skill slug
    mode                TEXT NOT NULL DEFAULT 'study',  -- study | exam | placement | review
    callback            TEXT NOT NULL DEFAULT '',
    reason              TEXT NOT NULL DEFAULT '',
    load_score          REAL NOT NULL DEFAULT 0,
    planned_minutes     INTEGER NOT NULL DEFAULT 0,
    completed           INTEGER NOT NULL DEFAULT 0,
    completed_at        TEXT,
    sample_id           INTEGER REFERENCES samples(id) ON DELETE SET NULL
);

-- ─── 3. Practice evidence ─────────────────────────────────────────────────
-- One row per actual learning attempt: dictation answer, essay, speaking
-- sample, reading drill, vocab quiz, placement item, or mock section.
CREATE TABLE IF NOT EXISTS samples (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    session_id          TEXT NOT NULL DEFAULT '',       -- Agent session key, e.g. tg:123
    skill_type          TEXT NOT NULL,
    domain              TEXT NOT NULL DEFAULT '',       -- ability domain for aggregation
    section             TEXT NOT NULL DEFAULT '',       -- English practice section or vocab/other
    mode                TEXT NOT NULL DEFAULT 'study',  -- study | exam | placement | review
    completed           INTEGER NOT NULL DEFAULT 1,
    duration_seconds    INTEGER,
    minutes             INTEGER NOT NULL DEFAULT 1,
    prompt              TEXT NOT NULL DEFAULT '',
    raw_content         TEXT NOT NULL DEFAULT '',       -- user's raw answer / transcript
    feedback            TEXT NOT NULL DEFAULT '',       -- natural-language diagnosis
    translation         TEXT NOT NULL DEFAULT '',
    audio_path          TEXT,
    image_path          TEXT,
    source_url          TEXT NOT NULL DEFAULT '',
    accuracy            REAL,                           -- 0.0-1.0 for objective drills
    raw_score           REAL,
    max_score           REAL,
    band_task           REAL,
    band_coherence      REAL,
    band_lexical        REAL,
    band_grammar        REAL,
    band_pronunciation  REAL,
    band_overall        REAL,
    ui_feedback         TEXT NOT NULL DEFAULT '',
    parent_sample_id    INTEGER REFERENCES samples(id) ON DELETE SET NULL,
    redo_count          INTEGER NOT NULL DEFAULT 0,
    prompt_hash         TEXT NOT NULL DEFAULT '',       -- retry/revenge chain key
    load_score          REAL NOT NULL DEFAULT 0,
    metadata            TEXT NOT NULL DEFAULT ''        -- JSON object for skill-owned extras
);

-- ─── 4. Concrete errors ───────────────────────────────────────────────────
-- Specific mistakes found in a sample. These rows are evidence; do not store
-- vague observations here. `recurrence_key` must come from error-keys.md.
CREATE TABLE IF NOT EXISTS errors (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    sample_id           INTEGER NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
    recurrence_key      TEXT NOT NULL,
    category            TEXT NOT NULL DEFAULT '',
    severity            TEXT NOT NULL DEFAULT 'medium', -- low | medium | high
    original_phrase     TEXT NOT NULL DEFAULT '',
    correction          TEXT NOT NULL DEFAULT '',
    rule_note           TEXT NOT NULL DEFAULT '',
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── 5. Recurring weakness aggregate ──────────────────────────────────────
-- Fast planner/coaching cache derived from `errors`. `persist` updates it in
-- the same transaction when writing error rows.
CREATE TABLE IF NOT EXISTS error_patterns (
    recurrence_key      TEXT PRIMARY KEY,
    category            TEXT NOT NULL DEFAULT '',
    severity_score      INTEGER NOT NULL DEFAULT 3,     -- 1 low, 3 medium, 5 high
    seen_count          INTEGER NOT NULL DEFAULT 0,
    first_seen_at       TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen_at        TEXT NOT NULL DEFAULT (datetime('now')),
    last_sample_id      INTEGER REFERENCES samples(id) ON DELETE SET NULL,
    last_original       TEXT NOT NULL DEFAULT '',
    last_correction     TEXT NOT NULL DEFAULT '',
    rule_note           TEXT NOT NULL DEFAULT ''
);

-- ─── 6. Sub-capability scores ─────────────────────────────────────────────
-- Fine-grained ability evidence, e.g. writing.argument_depth,
-- listening.connected_speech, speaking.fluency. Used by learner-state.
CREATE TABLE IF NOT EXISTS subcap_scores (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    sample_id           INTEGER NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
    subcap_key          TEXT NOT NULL,
    score               REAL NOT NULL,                  -- IELTS-style 0-9 unless noted
    evidence            TEXT NOT NULL DEFAULT '',
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── 7. Vocabulary inventory ──────────────────────────────────────────────
-- Unified notebook for words, chunks, sentence patterns, and personal-error
-- cards. Separate paraphrase tables are intentionally omitted for now; use
-- `item_kind`, `topics`, and `metadata` until a real feature needs more.
CREATE TABLE IF NOT EXISTS words (
    word                TEXT PRIMARY KEY,
    item_kind           TEXT NOT NULL DEFAULT 'word',   -- word | chunk | pattern | personal_error
    definition          TEXT NOT NULL DEFAULT '',
    chinese             TEXT NOT NULL DEFAULT '',
    ipa                 TEXT NOT NULL DEFAULT '',
    pos                 TEXT NOT NULL DEFAULT '',
    collocations        TEXT NOT NULL DEFAULT '',
    topics              TEXT NOT NULL DEFAULT '',
    example_en          TEXT NOT NULL DEFAULT '',
    example_cn          TEXT NOT NULL DEFAULT '',
    audio_path          TEXT NOT NULL DEFAULT '',
    mastery             TEXT NOT NULL DEFAULT 'queued_new', -- queued_new | learning | known | mastered
    origin              TEXT NOT NULL DEFAULT 'manual_save',
    source_sample_id    INTEGER REFERENCES samples(id) ON DELETE SET NULL,
    priority            INTEGER NOT NULL DEFAULT 0,
    transfer_level      INTEGER NOT NULL DEFAULT 0,
    is_user_word        INTEGER NOT NULL DEFAULT 0,
    lookup_count        INTEGER NOT NULL DEFAULT 0,
    review_count        INTEGER NOT NULL DEFAULT 0,
    success_count       INTEGER NOT NULL DEFAULT 0,
    fail_count          INTEGER NOT NULL DEFAULT 0,
    last_result         TEXT NOT NULL DEFAULT '',
    srs_due             TEXT,
    srs_interval_days   INTEGER NOT NULL DEFAULT 0,
    srs_ease            REAL NOT NULL DEFAULT 2.5,
    introduced_at       TEXT,
    last_seen_at        TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
    metadata            TEXT NOT NULL DEFAULT ''        -- JSON object for feature-specific extras
);

-- ─── 8. Vocabulary review evidence ────────────────────────────────────────
-- One row per SRS attempt. The current state lives on `words`; this table
-- preserves the evidence needed to debug or tune the review algorithm.
CREATE TABLE IF NOT EXISTS word_reviews (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    word                TEXT NOT NULL REFERENCES words(word) ON DELETE CASCADE,
    session_id          TEXT NOT NULL DEFAULT '',
    reviewed_at         TEXT NOT NULL DEFAULT (datetime('now')),
    rating              INTEGER NOT NULL,               -- 0-5
    passed              INTEGER NOT NULL DEFAULT 0,
    interval_days       INTEGER NOT NULL DEFAULT 0,
    card_type           TEXT NOT NULL DEFAULT 'recall',
    context             TEXT NOT NULL DEFAULT ''
);

-- ─── 9. Ability trend cache ───────────────────────────────────────────────
-- Daily derived band estimate per domain/section. `persist` may incrementally
-- update this; `learner-state` may recompute it from samples/subcap_scores.
CREATE TABLE IF NOT EXISTS band_trend (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    date                TEXT NOT NULL,                  -- YYYY-MM-DD
    section             TEXT NOT NULL,                  -- listening | speaking | reading | writing | vocab | overall
    band_estimate       REAL NOT NULL,
    sample_count        INTEGER NOT NULL DEFAULT 0,
    source              TEXT NOT NULL DEFAULT 'learner-state',
    UNIQUE(date, section)
);

-- ─── 10. Daily activity cache ─────────────────────────────────────────────
-- Lightweight daily aggregate for streaks, fatigue, and coaching nudges.
CREATE TABLE IF NOT EXISTS activity_log (
    date                TEXT PRIMARY KEY,               -- YYYY-MM-DD
    sessions_count      INTEGER NOT NULL DEFAULT 0,
    minutes_total       INTEGER NOT NULL DEFAULT 0,
    sections_touched    TEXT NOT NULL DEFAULT '',
    words_reviewed      INTEGER NOT NULL DEFAULT 0,
    new_words_added     INTEGER NOT NULL DEFAULT 0
);

-- ─── Indexes ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_daily_tasks_date ON daily_tasks(date);
CREATE INDEX IF NOT EXISTS idx_daily_tasks_done ON daily_tasks(date, completed);
CREATE INDEX IF NOT EXISTS idx_samples_created ON samples(created_at);
CREATE INDEX IF NOT EXISTS idx_samples_skill ON samples(skill_type);
CREATE INDEX IF NOT EXISTS idx_samples_section ON samples(section);
CREATE INDEX IF NOT EXISTS idx_samples_session ON samples(session_id);
CREATE INDEX IF NOT EXISTS idx_samples_hash ON samples(prompt_hash);
CREATE INDEX IF NOT EXISTS idx_samples_parent ON samples(parent_sample_id);
CREATE INDEX IF NOT EXISTS idx_errors_sample ON errors(sample_id);
CREATE INDEX IF NOT EXISTS idx_errors_key ON errors(recurrence_key);
CREATE INDEX IF NOT EXISTS idx_patterns_priority ON error_patterns(seen_count DESC, severity_score DESC);
CREATE INDEX IF NOT EXISTS idx_subcap_sample ON subcap_scores(sample_id);
CREATE INDEX IF NOT EXISTS idx_subcap_key ON subcap_scores(subcap_key);
CREATE INDEX IF NOT EXISTS idx_words_mastery ON words(mastery);
CREATE INDEX IF NOT EXISTS idx_words_srs_due ON words(srs_due);
CREATE INDEX IF NOT EXISTS idx_words_priority ON words(is_user_word, priority);
CREATE INDEX IF NOT EXISTS idx_words_origin ON words(origin);
CREATE INDEX IF NOT EXISTS idx_words_item_kind ON words(item_kind);
CREATE INDEX IF NOT EXISTS idx_word_reviews_word ON word_reviews(word);
CREATE INDEX IF NOT EXISTS idx_band_trend_section_date ON band_trend(section, date DESC);
CREATE INDEX IF NOT EXISTS idx_activity_date ON activity_log(date DESC);
