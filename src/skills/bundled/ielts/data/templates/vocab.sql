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
    example         TEXT NOT NULL DEFAULT '',
    mastery         TEXT NOT NULL DEFAULT 'new',
    srs_interval    INTEGER NOT NULL DEFAULT 0,
    srs_due         TEXT,
    srs_ease        REAL NOT NULL DEFAULT 2.5,
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
CREATE INDEX IF NOT EXISTS idx_word_events_word ON word_events(word);
