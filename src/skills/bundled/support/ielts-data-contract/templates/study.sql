-- study.db — unified schema for the entire English-tutor package
-- Practice samples, errors, subcap scores, daily tasks,
-- stage transitions, vocabulary notebook, and word events.

-- ─── Practice / learner records ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS samples (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at          TEXT NOT NULL,
    skill_type          TEXT NOT NULL,
    mode                TEXT NOT NULL DEFAULT 'study',  -- 'study' | 'placement'
    completed           INTEGER NOT NULL DEFAULT 1,     -- 0 = abandoned, 1 = finished
    duration_seconds    INTEGER,                        -- wall-clock time for this practice
    prompt              TEXT NOT NULL DEFAULT '',
    raw_content         TEXT NOT NULL DEFAULT '',
    band_task           REAL,
    band_coherence      REAL,
    band_lexical        REAL,
    band_grammar        REAL,
    band_overall        REAL,
    accuracy            REAL,                           -- 0.0–1.0, queryable correct ratio (e.g. 6/8 = 0.75)
    raw_score           INTEGER,                        -- items correct (numerator)
    max_score           INTEGER,                        -- items total  (denominator)
    audio_path          TEXT,                           -- Essential for 'Revenge Protocol' audio reuse
    session_id          TEXT NOT NULL DEFAULT '',
    feedback            TEXT NOT NULL DEFAULT '',
    difficulty_switches INTEGER NOT NULL DEFAULT 0,
    ui_feedback         TEXT NOT NULL DEFAULT '',       -- NEW: Stores clicked inline buttons e.g., "slower,too_hard"
    translation         TEXT NOT NULL DEFAULT '',
    parent_sample_id    INTEGER REFERENCES samples(id),
    redo_count          INTEGER NOT NULL DEFAULT 0,
    prompt_hash         TEXT NOT NULL DEFAULT '',
    load_score          REAL NOT NULL DEFAULT 0,
    session_window      TEXT DEFAULT ''
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
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    sample_id  INTEGER NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
    word       TEXT NOT NULL,
    usage_type TEXT NOT NULL DEFAULT 'exposure'
);

CREATE TABLE IF NOT EXISTS subcap_scores (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    sample_id  INTEGER NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
    subcap_key TEXT NOT NULL,
    score      REAL NOT NULL,
    evidence   TEXT DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_tasks (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    date         TEXT NOT NULL,
    task_type    TEXT NOT NULL,
    skill        TEXT NOT NULL,
    mode         TEXT NOT NULL,
    callback     TEXT NOT NULL,
    load_score   REAL NOT NULL DEFAULT 0,
    completed    INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    sample_id    INTEGER REFERENCES samples(id)
);

CREATE TABLE IF NOT EXISTS stage_transitions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    changed_at    TEXT NOT NULL,
    from_stage    TEXT NOT NULL,
    to_stage      TEXT NOT NULL,
    from_path     TEXT,
    to_path       TEXT,
    reason        TEXT NOT NULL,
    snapshot_path TEXT
);

-- ─── Vocabulary notebook + SRS ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS words (
    word             TEXT PRIMARY KEY,
    definition       TEXT NOT NULL DEFAULT '',
    chinese          TEXT NOT NULL DEFAULT '',
    ipa              TEXT NOT NULL DEFAULT '',
    pos              TEXT NOT NULL DEFAULT '',
    collocations     TEXT NOT NULL DEFAULT '',
    topics           TEXT NOT NULL DEFAULT '',
    source           TEXT NOT NULL DEFAULT 'lookup',
    origin           TEXT NOT NULL DEFAULT 'auto_seed',
    example_en       TEXT NOT NULL DEFAULT '',
    example_cn       TEXT NOT NULL DEFAULT '',
    audio_path       TEXT NOT NULL DEFAULT '',
    mastery          TEXT NOT NULL DEFAULT 'queued_new',
    transfer_level   INTEGER NOT NULL DEFAULT 0,
    is_user_word     INTEGER NOT NULL DEFAULT 0,
    priority         INTEGER NOT NULL DEFAULT 0,
    lookup_count     INTEGER NOT NULL DEFAULT 0,
    review_count     INTEGER NOT NULL DEFAULT 0,
    success_count    INTEGER NOT NULL DEFAULT 0,
    fail_count       INTEGER NOT NULL DEFAULT 0,
    last_result      TEXT NOT NULL DEFAULT '',
    srs_interval     INTEGER NOT NULL DEFAULT 0,
    srs_due          TEXT,
    srs_ease         REAL NOT NULL DEFAULT 2.5,
    item_kind        TEXT NOT NULL DEFAULT 'word',
    source_sample_id INTEGER REFERENCES samples(id),
    introduced_at    TEXT,
    last_seen_at     TEXT,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS word_events (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    word         TEXT NOT NULL REFERENCES words(word) ON DELETE CASCADE,
    event_type   TEXT NOT NULL,
    session_type TEXT NOT NULL DEFAULT '',
    context      TEXT NOT NULL DEFAULT '',
    created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS paraphrase_groups (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    topic      TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS paraphrase_members (
    group_id INTEGER NOT NULL REFERENCES paraphrase_groups(id) ON DELETE CASCADE,
    word_id  TEXT    NOT NULL REFERENCES words(word) ON DELETE CASCADE,
    register TEXT    NOT NULL DEFAULT 'neutral',
    PRIMARY KEY (group_id, word_id)
);

-- ─── Progress tracking (derived / cache) ───────────────────────────────────

-- Rolling per-section band estimate, one row per (section, date)
CREATE TABLE IF NOT EXISTS band_trend (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    date          TEXT NOT NULL,                       -- YYYY-MM-DD
    section       TEXT NOT NULL,                       -- listening | reading | writing | speaking | overall
    band_estimate REAL NOT NULL,
    sample_count  INTEGER,                             -- how many sessions fed into this estimate
    source        TEXT DEFAULT 'learner-state',        -- 'learner-state' | 'placement'
    UNIQUE(date, section)
);

-- Daily activity summary
CREATE TABLE IF NOT EXISTS activity_log (
    date             TEXT PRIMARY KEY,               -- YYYY-MM-DD
    sessions_count   INTEGER DEFAULT 0,
    minutes_total    INTEGER DEFAULT 0,
    sections_touched TEXT DEFAULT '',                 -- comma-separated: 'speaking,writing'
    words_reviewed   INTEGER DEFAULT 0,
    new_words_added  INTEGER DEFAULT 0
);

-- ─── Indexes ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_samples_created       ON samples(created_at);
CREATE INDEX IF NOT EXISTS idx_samples_skill         ON samples(skill_type);
CREATE INDEX IF NOT EXISTS idx_samples_mode          ON samples(mode);
CREATE INDEX IF NOT EXISTS idx_samples_parent        ON samples(parent_sample_id);
CREATE INDEX IF NOT EXISTS idx_samples_hash          ON samples(prompt_hash);
CREATE INDEX IF NOT EXISTS idx_errors_sample         ON errors(sample_id);
CREATE INDEX IF NOT EXISTS idx_errors_key            ON errors(recurrence_key);
CREATE INDEX IF NOT EXISTS idx_sample_words_word     ON sample_words(word);
CREATE INDEX IF NOT EXISTS idx_subcap_sample         ON subcap_scores(sample_id);
CREATE INDEX IF NOT EXISTS idx_subcap_key            ON subcap_scores(subcap_key);
CREATE INDEX IF NOT EXISTS idx_daily_date            ON daily_tasks(date);
CREATE INDEX IF NOT EXISTS idx_stage_changed         ON stage_transitions(changed_at);
CREATE INDEX IF NOT EXISTS idx_words_mastery         ON words(mastery);
CREATE INDEX IF NOT EXISTS idx_words_srs_due         ON words(srs_due);
CREATE INDEX IF NOT EXISTS idx_words_transfer_level  ON words(transfer_level);
CREATE INDEX IF NOT EXISTS idx_words_origin          ON words(origin);
CREATE INDEX IF NOT EXISTS idx_words_user_priority   ON words(is_user_word, priority);
CREATE INDEX IF NOT EXISTS idx_words_item_kind       ON words(item_kind);
CREATE INDEX IF NOT EXISTS idx_word_events_word      ON word_events(word);
CREATE INDEX IF NOT EXISTS idx_paraphrase_group      ON paraphrase_members(group_id);
CREATE INDEX IF NOT EXISTS idx_trend_section_date    ON band_trend(section, date DESC);
CREATE INDEX IF NOT EXISTS idx_activity_date         ON activity_log(date DESC);
