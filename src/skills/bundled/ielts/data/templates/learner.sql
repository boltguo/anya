-- learner.db schema
-- Practice samples, errors, tracked words, and weekly plans

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

CREATE INDEX IF NOT EXISTS idx_samples_created ON samples(created_at);
CREATE INDEX IF NOT EXISTS idx_samples_skill ON samples(skill_type);
CREATE INDEX IF NOT EXISTS idx_errors_sample ON errors(sample_id);
CREATE INDEX IF NOT EXISTS idx_errors_key ON errors(recurrence_key);
CREATE INDEX IF NOT EXISTS idx_sample_words_word ON sample_words(word);
CREATE INDEX IF NOT EXISTS idx_plan_week ON plan(week_start);
