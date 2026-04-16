-- vocab.db schema
-- Vocabulary notebook with SRS (spaced repetition)

CREATE TABLE IF NOT EXISTS words (
    word            TEXT PRIMARY KEY,
    definition      TEXT NOT NULL DEFAULT '',
    chinese         TEXT NOT NULL DEFAULT '',
    ipa             TEXT NOT NULL DEFAULT '',
    pos             TEXT NOT NULL DEFAULT '',
    collocations    TEXT NOT NULL DEFAULT '',
    topics          TEXT NOT NULL DEFAULT '',
    source          TEXT NOT NULL DEFAULT 'lookup',
    origin          TEXT NOT NULL DEFAULT 'auto_seed',
    example_en      TEXT NOT NULL DEFAULT '',
    example_cn      TEXT NOT NULL DEFAULT '',
    audio_path      TEXT NOT NULL DEFAULT '',
    mastery         TEXT NOT NULL DEFAULT 'queued_new',
    transfer_level  INTEGER NOT NULL DEFAULT 0,
    is_user_word    INTEGER NOT NULL DEFAULT 0,
    priority        INTEGER NOT NULL DEFAULT 0,
    lookup_count    INTEGER NOT NULL DEFAULT 0,
    review_count    INTEGER NOT NULL DEFAULT 0,
    success_count   INTEGER NOT NULL DEFAULT 0,
    fail_count      INTEGER NOT NULL DEFAULT 0,
    last_result     TEXT NOT NULL DEFAULT '',
    srs_interval    INTEGER NOT NULL DEFAULT 0,
    srs_due         TEXT,
    srs_ease        REAL NOT NULL DEFAULT 2.5,
    introduced_at   TEXT,
    last_seen_at    TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS word_events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    word            TEXT NOT NULL REFERENCES words(word) ON DELETE CASCADE,
    event_type      TEXT NOT NULL,
    session_type    TEXT NOT NULL DEFAULT '',
    context         TEXT NOT NULL DEFAULT '',
    created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_words_mastery ON words(mastery);
CREATE INDEX IF NOT EXISTS idx_words_srs_due ON words(srs_due);
CREATE INDEX IF NOT EXISTS idx_words_transfer_level ON words(transfer_level);
CREATE INDEX IF NOT EXISTS idx_words_origin ON words(origin);
CREATE INDEX IF NOT EXISTS idx_words_user_priority ON words(is_user_word, priority);
CREATE INDEX IF NOT EXISTS idx_word_events_word ON word_events(word);
