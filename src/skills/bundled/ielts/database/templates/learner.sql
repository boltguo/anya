-- learner.db schema
-- Practice samples, errors, tracked words, sub-capability scores,
-- daily tasks, mock sessions, and stage transitions

CREATE TABLE IF NOT EXISTS samples (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at        TEXT NOT NULL,
    skill_type        TEXT NOT NULL,
    prompt            TEXT NOT NULL DEFAULT '',
    raw_content       TEXT NOT NULL DEFAULT '',
    band_task         REAL,
    band_coherence    REAL,
    band_lexical      REAL,
    band_grammar      REAL,
    band_overall      REAL,
    audio_path        TEXT,
    session_id        TEXT NOT NULL DEFAULT '',
    feedback          TEXT NOT NULL DEFAULT '',
    difficulty_switches INTEGER NOT NULL DEFAULT 0,
    translation       TEXT NOT NULL DEFAULT '',
    parent_sample_id  INTEGER REFERENCES samples(id),
    redo_count        INTEGER NOT NULL DEFAULT 0,
    prompt_hash       TEXT NOT NULL DEFAULT '',
    load_score        REAL NOT NULL DEFAULT 0,
    session_window    TEXT DEFAULT ''
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

CREATE TABLE IF NOT EXISTS subcap_scores (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    sample_id   INTEGER NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
    subcap_key  TEXT NOT NULL,
    score       REAL NOT NULL,
    evidence    TEXT DEFAULT '',
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_tasks (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    date          TEXT NOT NULL,
    task_type     TEXT NOT NULL,
    skill         TEXT NOT NULL,
    mode          TEXT NOT NULL,
    callback      TEXT NOT NULL,
    load_score    REAL NOT NULL DEFAULT 0,
    completed     INTEGER NOT NULL DEFAULT 0,
    completed_at  TEXT,
    sample_id     INTEGER REFERENCES samples(id)
);

CREATE TABLE IF NOT EXISTS mock_sessions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at      TEXT NOT NULL,
    type            TEXT NOT NULL,
    band_listening  REAL,
    band_reading    REAL,
    band_writing    REAL,
    band_speaking   REAL,
    band_overall    REAL,
    stability_score REAL,
    notes           TEXT DEFAULT ''
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

CREATE INDEX IF NOT EXISTS idx_samples_created  ON samples(created_at);
CREATE INDEX IF NOT EXISTS idx_samples_skill    ON samples(skill_type);
CREATE INDEX IF NOT EXISTS idx_samples_parent   ON samples(parent_sample_id);
CREATE INDEX IF NOT EXISTS idx_samples_hash     ON samples(prompt_hash);
CREATE INDEX IF NOT EXISTS idx_errors_sample    ON errors(sample_id);
CREATE INDEX IF NOT EXISTS idx_errors_key       ON errors(recurrence_key);
CREATE INDEX IF NOT EXISTS idx_sample_words_word ON sample_words(word);
CREATE INDEX IF NOT EXISTS idx_subcap_sample    ON subcap_scores(sample_id);
CREATE INDEX IF NOT EXISTS idx_subcap_key       ON subcap_scores(subcap_key);
CREATE INDEX IF NOT EXISTS idx_daily_date       ON daily_tasks(date);
CREATE INDEX IF NOT EXISTS idx_mock_created     ON mock_sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_stage_changed    ON stage_transitions(changed_at);
