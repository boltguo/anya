-- state.db — agent runtime: conversation sessions + messages + API usage tracking.
--
-- This is agent-owned infrastructure (system tables), NOT learner data.
-- Long-lived learner data lives in study.db.

PRAGMA foreign_keys = ON;

-- ─── Conversation sessions ────────────────────────────────────────────────
-- One row per logical chat session. `session_key` groups them by user/chat.
CREATE TABLE IF NOT EXISTS sessions (
    id              TEXT PRIMARY KEY,
    session_key     TEXT NOT NULL,
    title           TEXT NOT NULL DEFAULT '',
    -- Active skill drives per-turn tool filtering (Tier 2 compound tools).
    -- NULL = no active skill (planner / menu state).
    active_skill    TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    message_count   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sessions_key ON sessions(session_key);
CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);

-- ─── Messages ─────────────────────────────────────────────────────────────
-- Individual turn entries; raw_parts preserves provider-native parts
-- (e.g. thinking blocks) so provider replay works after restart.
CREATE TABLE IF NOT EXISTS messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      TEXT NOT NULL REFERENCES sessions(id),
    role            TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant', 'tool')),
    content         TEXT,
    tool_calls      TEXT,
    tool_call_id    TEXT,
    tool_name       TEXT,
    raw_parts       TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    seq             INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, seq);

-- ─── API usage tracking ───────────────────────────────────────────────────
-- One row per billable external call (LLM, TTS, STT, vision, etc.).
-- `month` is 'YYYY-MM' for fast monthly rollups; `day` is the two-digit day
-- of month (filter as `month=? AND day=?` to get a specific date).
CREATE TABLE IF NOT EXISTS usage_events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    month           TEXT NOT NULL,                  -- YYYY-MM
    day             TEXT NOT NULL,                  -- DD (day of month, two digits)
    service         TEXT NOT NULL,                  -- llm | tts | stt | pron_assess | web_search | vision
    provider        TEXT NOT NULL DEFAULT '',       -- backend slug for llm rows
    calls           INTEGER NOT NULL DEFAULT 1,
    input_tokens    INTEGER NOT NULL DEFAULT 0,
    output_tokens   INTEGER NOT NULL DEFAULT 0,
    cached_tokens   INTEGER NOT NULL DEFAULT 0,
    chars           INTEGER NOT NULL DEFAULT 0,
    duration_sec    REAL NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_usage_month ON usage_events(month, service);
CREATE INDEX IF NOT EXISTS idx_usage_day ON usage_events(month, day, service);
