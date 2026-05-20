-- study.db — canonical English learning schema (v3, slim).
--
-- Design principle: raw evidence tables strong, caches/derivatives weak.
-- Closed loop: profile → samples + errors + subcap_scores + words + word_reviews.
-- Anything that can be derived by a SELECT is NOT stored.
--
-- v3 (post-audit slim):
--   • Removed tables: band_trend, activity_log, daily_tasks, skill_runs
--     (all derivable, or feature dropped — placement accepts re-test on abort)
--   • samples slimmed: dropped domain, duration_seconds, translation, image_path,
--     source_url, load_score, band_task/coherence/lexical/grammar/pronunciation,
--     ui_feedback, redo_count, attempt_no — only band_overall stays as the
--     gating signal; the 4 IELTS sub-dims go to subcap_scores
--   • learner_profile: dropped timezone (UTC), l1 (zh fixed), preferred_tone,
--     study_pattern, daily_minutes, strengths, weaknesses (auto evidence wins)
--   • study_sessions: dropped platform, entrypoint, skills_used, plan, summary,
--     samples_count, minutes_total, duration_seconds (all derivable)
--   • error_patterns: dropped recent_examples, last_30d_count, status,
--     last_original/correction/sample_id (join errors+samples instead)
--   • subcap_scores: dropped scale_min/max, normalized_0_100, reliability,
--     scaffolded (use samples.assistance_level join)
--   • words: dropped topics (lexical_topics is canonical), lookup_count,
--     last_result, introduced_at, mastered_at, audio_path
--   • word_reviews: dropped passed, session_id, context (derivable / unused)
--   • progress_snapshots: slimmed to week + 4 scores + level + notes
--
-- Reset path: delete study.db, restart agent. No migrations.

PRAGMA foreign_keys = ON;

-- ─── 1. Learner profile ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS learner_profile (
    id              INTEGER PRIMARY KEY CHECK (id = 1),
    initialized     INTEGER NOT NULL DEFAULT 0,
    name            TEXT NOT NULL DEFAULT '',
    current_level   TEXT NOT NULL DEFAULT '',
    target_level    TEXT NOT NULL DEFAULT '',
    target_exam     TEXT NOT NULL DEFAULT 'IELTS',
    exam_date       TEXT,
    interests       TEXT NOT NULL DEFAULT '',
    avoid_topics    TEXT NOT NULL DEFAULT '',
    daily_english   TEXT NOT NULL DEFAULT '',
    notes           TEXT NOT NULL DEFAULT '',
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── 2. Study sessions (deliberate learning blocks) ───────────────────────
-- Sample counts / minutes / skills used are all derived from samples.
CREATE TABLE IF NOT EXISTS study_sessions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_key TEXT NOT NULL DEFAULT '',
    started_at  TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at    TEXT,
    status      TEXT NOT NULL DEFAULT 'active'  -- active | closed | abandoned
);

-- ─── 3. Error key whitelist ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS error_keys (
    key         TEXT PRIMARY KEY,
    category    TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT ''
);

INSERT OR IGNORE INTO error_keys (key, category, description) VALUES
    ('function_word_miss',     'listening', 'Missed article, preposition, pronoun, or auxiliary'),
    ('connected_speech_fail',  'listening', 'Failed to decode elision, assimilation, or linking'),
    ('number_confusion',       'listening', 'Mixed up -teen/-ty, dates, times, phone digits'),
    ('spelling_error',         'listening', 'Wrote wrong spelling for a correctly heard word'),
    ('word_substitution',      'listening', 'Replaced a word with a similar-sounding one'),
    ('tense_miss',             'listening', 'Missed verb tense marker'),
    ('plural_miss',            'listening', 'Missed plural ending'),
    ('tfng_logic_error',       'reading',   'Confused TRUE/FALSE/NOT GIVEN reasoning'),
    ('heading_mismatch',       'reading',   'Chose wrong heading for a paragraph'),
    ('keyword_matching_error', 'reading',   'Matched surface keywords instead of meaning'),
    ('inference_error',        'reading',   'Drew incorrect inference from text'),
    ('detail_location_fail',   'reading',   'Could not locate the relevant detail'),
    ('paraphrase_miss',        'reading',   'Failed to recognize a paraphrase'),
    ('time_pressure_skip',     'reading',   'Skipped or guessed due to time running out'),
    ('article_usage',          'grammar',   'Incorrect or missing a/an/the'),
    ('verb_form_error',        'grammar',   'Wrong tense, aspect, or subject-verb agreement'),
    ('preposition_error',      'grammar',   'Wrong preposition choice'),
    ('sentence_fragment',      'writing',   'Incomplete sentence'),
    ('run_on_sentence',        'writing',   'Two independent clauses without proper conjunction'),
    ('word_form_error',        'grammar',   'Wrong part of speech'),
    ('collocation_error',      'vocab',     'Unnatural word combination'),
    ('coherence_gap',          'writing',   'Missing or weak logical connector'),
    ('register_mismatch',      'writing',   'Tone too informal/formal for the task'),
    ('task_incomplete',        'writing',   'Did not address all parts of the prompt'),
    ('word_order_error',       'grammar',   'Non-standard word order'),
    ('relative_clause_error',  'grammar',   'Incorrect who/which/that usage'),
    ('filler_overuse',         'speaking',  'Excessive uh/um/you know/like'),
    ('self_correction_loop',   'speaking',  'Repeated self-corrections disrupting flow'),
    ('l1_transfer',            'speaking',  'Mother-tongue grammar pattern in English'),
    ('pronunciation_error',    'speaking',  'Systematic mispronunciation'),
    ('pronunciation_vowel',    'speaking',  'Vowel articulation unstable'),
    ('pronunciation_consonant','speaking',  'Consonant/word-final articulation unclear'),
    ('pronunciation_stress',   'speaking',  'Word- or sentence-stress placed incorrectly'),
    ('consonant_cluster',      'speaking',  'Consonant cluster simplified or mispronounced'),
    ('intonation',             'speaking',  'Intonation contour wrong for the utterance type'),
    ('vocabulary_repetition',  'speaking',  'Reused the same word/phrase excessively'),
    ('response_too_short',     'speaking',  'Answer lacked development or detail'),
    ('lexical_substitution',   'vocab',     'Used a wrong but related word'),
    ('false_friend',           'vocab',     'L1-influenced wrong word choice'),
    ('info_loss',              'speaking',  'Key information lost in retell/paraphrase'),
    ('role_break',             'speaking',  'Stepped out of the assigned role in roleplay'),
    ('paraphrase_parroting',   'speaking',  'Echoed source verbatim instead of paraphrasing'),
    ('register_too_formal',    'speaking',  'Register too formal for the scenario'),
    ('register_too_casual',    'speaking',  'Register too casual for the scenario'),
    ('politeness_error',       'speaking',  'Politeness marker missing or mis-pitched'),
    ('function_incomplete',    'speaking',  'Conversational function not completed');

-- ─── 4. Practice evidence (the core table) ────────────────────────────────
-- One row per learning attempt. Everything not in this table is either
-- derivable from these rows or doesn't belong in a learning closed loop.
CREATE TABLE IF NOT EXISTS samples (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    session_id          TEXT NOT NULL DEFAULT '',       -- denormalized session_key
    study_session_id    INTEGER REFERENCES study_sessions(id) ON DELETE SET NULL,
    skill_type          TEXT NOT NULL,                  -- listening.dictation, writing.essay, etc.
    section             TEXT NOT NULL DEFAULT '',       -- listening | speaking | reading | writing | vocab
    mode                TEXT NOT NULL DEFAULT 'study',  -- study | placement
    completed           INTEGER NOT NULL DEFAULT 1,
    minutes             INTEGER NOT NULL DEFAULT 1,
    prompt              TEXT NOT NULL DEFAULT '',
    response            TEXT NOT NULL DEFAULT '',
    feedback            TEXT NOT NULL DEFAULT '',
    audio_path          TEXT,                           -- TTS file for listening Revenge
    accuracy            REAL,                           -- 0.0-1.0 for objective drills
    raw_score           REAL,
    max_score           REAL,
    band_overall        REAL,                           -- 4 sub-bands go to subcap_scores
    parent_sample_id    INTEGER REFERENCES samples(id) ON DELETE SET NULL,  -- redo chain
    assistance_level    TEXT NOT NULL DEFAULT 'none',   -- none | hint | outline | sos | redo
    prompt_hash         TEXT NOT NULL DEFAULT '',       -- first 12 hex of sha1(normalized prompt)
    metadata            TEXT NOT NULL DEFAULT ''        -- JSON: source_url, button_taps, replays, etc.
);

-- ─── 5. Concrete errors ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS errors (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    sample_id       INTEGER NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
    recurrence_key  TEXT NOT NULL REFERENCES error_keys(key) ON DELETE RESTRICT,
    category        TEXT NOT NULL DEFAULT '',
    severity        TEXT NOT NULL DEFAULT 'medium',
    original_phrase TEXT NOT NULL DEFAULT '',
    correction      TEXT NOT NULL DEFAULT '',
    rule_note       TEXT NOT NULL DEFAULT '',
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── 6. Recurring weakness aggregate (slim) ───────────────────────────────
-- last_30d_count, status, recent_examples are derived at read time via JOIN
-- to errors+samples. This table only carries the cheap incremental counters.
CREATE TABLE IF NOT EXISTS error_patterns (
    recurrence_key  TEXT PRIMARY KEY REFERENCES error_keys(key) ON DELETE CASCADE,
    category        TEXT NOT NULL DEFAULT '',
    severity_score  INTEGER NOT NULL DEFAULT 3,
    seen_count      INTEGER NOT NULL DEFAULT 0,
    first_seen_at   TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen_at    TEXT NOT NULL DEFAULT (datetime('now')),
    rule_note       TEXT NOT NULL DEFAULT ''
);

-- ─── 7. Sub-capability scores ─────────────────────────────────────────────
-- All values on the canonical 0-10 scale. scaffolded is inferred via JOIN
-- to samples.assistance_level when learner-state needs it.
CREATE TABLE IF NOT EXISTS subcap_scores (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    sample_id   INTEGER NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
    subcap_key  TEXT NOT NULL,
    value       REAL NOT NULL,
    evidence    TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── 8. Vocabulary inventory ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS words (
    word                TEXT PRIMARY KEY,
    item_kind           TEXT NOT NULL DEFAULT 'word',   -- word | chunk | pattern | personal_error
    definition          TEXT NOT NULL DEFAULT '',
    chinese             TEXT NOT NULL DEFAULT '',
    ipa                 TEXT NOT NULL DEFAULT '',
    pos                 TEXT NOT NULL DEFAULT '',
    collocations        TEXT NOT NULL DEFAULT '',
    example_en          TEXT NOT NULL DEFAULT '',
    example_cn          TEXT NOT NULL DEFAULT '',
    mastery             TEXT NOT NULL DEFAULT 'queued_new',
    origin              TEXT NOT NULL DEFAULT 'manual_save',
    source_sample_id    INTEGER REFERENCES samples(id) ON DELETE SET NULL,
    priority            INTEGER NOT NULL DEFAULT 0,
    transfer_level      INTEGER NOT NULL DEFAULT 0,
    is_user_word        INTEGER NOT NULL DEFAULT 0,
    review_count        INTEGER NOT NULL DEFAULT 0,
    success_count       INTEGER NOT NULL DEFAULT 0,
    fail_count          INTEGER NOT NULL DEFAULT 0,
    consecutive_success INTEGER NOT NULL DEFAULT 0,
    srs_due             TEXT,
    srs_interval_days   INTEGER NOT NULL DEFAULT 0,
    srs_ease            REAL NOT NULL DEFAULT 2.5,
    last_seen_at        TEXT,
    last_success_at     TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
    metadata            TEXT NOT NULL DEFAULT ''
);

-- ─── 9. Lexical topics (relation) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lexical_topics (
    word    TEXT NOT NULL REFERENCES words(word) ON DELETE CASCADE,
    topic   TEXT NOT NULL,
    PRIMARY KEY (word, topic)
);

-- ─── 10. Vocabulary review evidence ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS word_reviews (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    word            TEXT NOT NULL REFERENCES words(word) ON DELETE CASCADE,
    sample_id       INTEGER REFERENCES samples(id) ON DELETE SET NULL,
    reviewed_at     TEXT NOT NULL DEFAULT (datetime('now')),
    rating          INTEGER NOT NULL,
    interval_days   INTEGER NOT NULL DEFAULT 0,
    card_type       TEXT NOT NULL DEFAULT 'recall'      -- recall | production | collocation | meaning
);

-- ─── 11. Weekly progress snapshots ────────────────────────────────────────
-- Long-arc trend. Vocab counts / minutes / sessions / weak_subcaps / top_errors
-- are all derivable from samples + word_reviews — no need to freeze.
CREATE TABLE IF NOT EXISTS progress_snapshots (
    week            TEXT PRIMARY KEY,                   -- ISO week, e.g. 2026-W19
    period_start    TEXT NOT NULL,
    period_end      TEXT NOT NULL,
    current_level   TEXT NOT NULL DEFAULT '',
    listening_score REAL,
    speaking_score  REAL,
    reading_score   REAL,
    writing_score   REAL,
    notes           TEXT NOT NULL DEFAULT '',
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Indexes ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_study_sessions_key      ON study_sessions(session_key);
CREATE INDEX IF NOT EXISTS idx_study_sessions_status   ON study_sessions(status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_samples_created         ON samples(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_samples_skill           ON samples(skill_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_samples_section         ON samples(section, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_samples_session         ON samples(session_id);
CREATE INDEX IF NOT EXISTS idx_samples_study_session   ON samples(study_session_id);
CREATE INDEX IF NOT EXISTS idx_samples_hash            ON samples(prompt_hash);
CREATE INDEX IF NOT EXISTS idx_samples_parent          ON samples(parent_sample_id);
CREATE INDEX IF NOT EXISTS idx_errors_sample           ON errors(sample_id);
CREATE INDEX IF NOT EXISTS idx_errors_key              ON errors(recurrence_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_patterns_priority      ON error_patterns(seen_count DESC, severity_score DESC);
CREATE INDEX IF NOT EXISTS idx_subcap_sample           ON subcap_scores(sample_id);
CREATE INDEX IF NOT EXISTS idx_subcap_key              ON subcap_scores(subcap_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_words_mastery           ON words(mastery);
CREATE INDEX IF NOT EXISTS idx_words_srs_due           ON words(srs_due);
CREATE INDEX IF NOT EXISTS idx_words_priority          ON words(is_user_word, priority);
CREATE INDEX IF NOT EXISTS idx_words_item_kind         ON words(item_kind);
CREATE INDEX IF NOT EXISTS idx_lexical_topics_topic    ON lexical_topics(topic);
CREATE INDEX IF NOT EXISTS idx_word_reviews_word       ON word_reviews(word, reviewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_progress_snapshots_end  ON progress_snapshots(period_end DESC);
