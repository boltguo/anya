# Study Data Cloud Sync And Artifact Archive

Date: 2026-05-16

## Goal

Keep Anya's primary runtime fast and stable while making study data and generated media easy to inspect online.

The source of truth remains the local SQLite `study.db` on the GCP machine. Cloudflare R2, D1, Feishu Bitable, and Google Sheets are downstream mirrors or dashboards only. They must never block the Telegram interaction path.

## Non-Goals

- Do not move the main agent loop to Cloudflare Workers.
- Do not make D1, Feishu, or Google Sheets the primary database.
- Do not wait for R2 upload before replying to the user unless the object is already cached remotely.
- Do not call `wrangler` from the runtime path. Wrangler is for provisioning and deployment, not per-message writes.

## Current Runtime Shape

Current flow:

```text
Telegram update
  -> GCP Anya gateway
  -> local SQLite state.db for conversation state
  -> local SQLite study.db for learning evidence
  -> local audio/image files under ~/.anya/data
  -> Telegram reply
```

Relevant current behavior:

- TTS writes an OGG/Opus file locally, then returns a local file path.
- `tg_msg(type="voice")` uploads the local file to Telegram.
- `persist` writes one `samples.audio_path` value when a practice row is stored.
- Slow-play buttons generate additional TTS files, but the current schema has no first-class way to attach multiple prompt/coaching/user audio files to one sample.

## Target Architecture

```text
                    primary path, must stay fast
Telegram <-> GCP Anya gateway <-> local study.db
                         |
                         | async, best-effort
                         v
                 local sync_outbox
                         |
          +--------------+----------------+
          |              |                |
          v              v                v
       R2 media       D1 mirror      Feishu / Sheets
       archive        for web UI     human-readable views
```

Responsibilities:

- **GCP**: fixed-IP runtime, Telegram gateway, LLM/STT/TTS calls, local SQLite source of truth, background sync worker.
- **R2**: generated/received media archive: TTS, user voice, images, documents, future artifacts.
- **D1**: selected `study.db` mirror for Cloudflare Worker dashboards and read-only analytics.
- **KV**: optional small config/cache layer for dashboard state, not core learning data.
- **Feishu Bitable / Google Sheets**: read-only reporting surfaces for humans.

Cloudflare references:

- Wrangler: https://developers.cloudflare.com/workers/wrangler/
- R2 S3-compatible API: https://developers.cloudflare.com/r2/get-started/s3/
- D1: https://developers.cloudflare.com/d1/
- Workers KV: https://developers.cloudflare.com/kv/

## Runtime Rule

The user-facing path must do only the minimum needed to respond:

```text
Generate or receive media
  -> write local file
  -> write local SQLite if needed
  -> send Telegram response
  -> enqueue cloud sync
```

All remote sync is best-effort. If R2, D1, Feishu, or Google Sheets is slow or down, Anya should still complete the Telegram turn.

## R2 Artifact Strategy

R2 should store original artifacts, not derived files unless a derived artifact is useful by itself.

Examples:

- `tts/2026/05/16/<artifact_id>.ogg`
- `voice/2026/05/16/<artifact_id>.ogg`
- `images/received/2026/05/16/<artifact_id>.jpg`
- `images/generated/2026/05/16/<artifact_id>.png`

Use private buckets by default. Store `r2_key`, not a short-lived signed URL, in SQLite. A dashboard Worker can generate temporary access or proxy downloads later.

### Telegram Send Strategy

For newly generated audio, keep sending the local file directly to Telegram. Uploading to R2 before `sendVoice` would add latency and another failure point.

Preferred order:

```text
Azure TTS -> local OGG -> Telegram sendVoice -> enqueue R2 upload
```

Only use an R2 URL for Telegram if the artifact is already uploaded and the URL path is known to be faster or cached.

Also store Telegram's returned `file_id` once available. For exact replays, `file_id` can be faster than uploading either local file or R2 URL.

## Local Schema Additions

Add an `artifacts` table for every local or remote media object:

```sql
CREATE TABLE artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  kind TEXT NOT NULL,                 -- tts | user_voice | image | document
  role TEXT NOT NULL DEFAULT '',       -- prompt_original | prompt_slow | user_voice | coaching_voice | vocab_audio
  local_path TEXT NOT NULL DEFAULT '',
  r2_key TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT '',
  size_bytes INTEGER,
  duration_seconds REAL,
  sha256 TEXT NOT NULL DEFAULT '',
  telegram_file_id TEXT NOT NULL DEFAULT '',
  sync_status TEXT NOT NULL DEFAULT 'pending',
  sync_error TEXT NOT NULL DEFAULT '',
  metadata TEXT NOT NULL DEFAULT ''
);
```

Add a join table from samples to artifacts:

```sql
CREATE TABLE sample_artifacts (
  sample_id INTEGER NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
  artifact_id INTEGER NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (sample_id, artifact_id, role)
);
```

Keep `samples.audio_path` for backward compatibility, but treat it as `primary_audio_path`, usually the original-speed prompt audio.

## Slow Playback Handling

Current skills can generate multiple audio files for one exercise:

- original prompt audio
- slow prompt audio after `🐢 慢速播放` / `🐢 慢速示范`
- user voice answer
- coaching voice after feedback

The current `samples.audio_path` can only store one path, so it may lose the distinction between original and slow audio.

New rule:

- `samples.audio_path`: original prompt audio when available.
- `sample_artifacts(role='prompt_original')`: original prompt audio.
- `sample_artifacts(role='prompt_slow')`: every slow replay generated for the same prompt.
- `sample_artifacts(role='user_voice')`: user's submitted voice.
- `sample_artifacts(role='coaching_voice')`: targeted coaching audio generated after assessment.
- `samples.ui_feedback`: still records whether the user tapped slow/hard buttons.

This makes dashboard playback accurate: it can show that the learner answered after hearing a slow replay, without losing the original source audio.

## Sync Outbox

Add a local outbox table:

```sql
CREATE TABLE sync_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  target TEXT NOT NULL,                -- r2 | d1 | feishu | sheets
  entity_type TEXT NOT NULL,           -- artifact | sample | word | error | subcap | progress
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL DEFAULT 'upsert',
  payload_json TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  last_error TEXT NOT NULL DEFAULT ''
);
```

Local writes enqueue outbox rows in the same transaction as the source data. The background sync worker processes rows independently.

Retry policy:

- exponential backoff with jitter
- cap retry frequency to protect quotas
- mark poison rows as `failed` after repeated errors
- expose failed rows in logs/dashboard

## D1 Mirror Strategy

D1 should mirror only data useful for online inspection:

- `samples`
- `errors`
- `subcap_scores`
- `words`
- `word_reviews`
- `band_trend`
- `progress_snapshots`
- `artifacts` metadata, not binary content

Do not mirror `state.db` conversation history by default. It is large, private, and not needed for study dashboards.

Use idempotent upserts keyed by local IDs. Every D1 row should include:

- `local_id`
- `created_at`
- `updated_at` or sync time
- enough denormalized fields for read-heavy dashboard queries

## Feishu And Google Sheets Strategy

These should be reporting sinks, not runtime dependencies.

Good candidates:

- daily practice summary
- recent sample list
- top recurring errors
- vocabulary queue
- weekly progress snapshot
- artifact index for generated audio/images

Avoid per-tool-call writes. Batch them:

- every 5-15 minutes for operational views
- daily for summary reports
- manual one-shot export when needed

Feishu Bitable is better for typed fields, filtered views, and human operations. Google Sheets is better for lightweight export and charting.

## Wrangler Usage

Use Wrangler on the GCP machine for setup and deployment:

- `wrangler r2 bucket create ...`
- `wrangler d1 create ...`
- `wrangler d1 migrations apply ...`
- `wrangler deploy` for dashboard/sync Workers
- `wrangler secret put ...` for Worker secrets

Do not invoke Wrangler from `persist`, TTS, Telegram handlers, or background sync. Runtime code should use SDKs or HTTP APIs directly.

## Deployment Phases

### Phase 1: Artifact Tracking

- Add `artifacts`, `sample_artifacts`, and `sync_outbox` tables.
- Record TTS outputs, user voice, and received images as local artifacts.
- Keep all Telegram sends local-first.

### Phase 2: R2 Archive

- Configure R2 bucket and S3 credentials.
- Add a background sync worker that uploads pending artifact files.
- Store `r2_key`, `size_bytes`, `sha256`, and `sync_status`.
- Do not block Telegram on upload.

### Phase 3: Study Data Mirror

- Create D1 schema for dashboard-friendly copies of study tables.
- Batch upsert selected rows from `sync_outbox`.
- Add a simple read-only Worker endpoint for dashboard queries.

### Phase 4: Human-Readable Reporting

- Add Feishu Bitable or Google Sheets as a batch sink.
- Start with daily/weekly summary rows, not raw full-fidelity data.
- Keep manual edits out of the sync-back path.

### Phase 5: Web Dashboard

- Worker dashboard reads D1 and generates signed/proxied R2 access for media playback.
- Dashboard stays read-only at first.
- Later write actions can be added only after permission and audit rules are clear.

## Open Decisions

1. Whether to build Feishu or Google Sheets first.
2. Whether `telegram_file_id` should become the primary replay path for Telegram-only replays.
3. How long to keep local media after successful R2 upload.
4. Whether dashboard media access should use signed URLs or a Worker proxy.

## Recommendation

Start with `artifacts + sync_outbox + R2 upload`. This gives immediate value, reduces local media risk, and does not touch the core learning loop.

After that, add D1 as a read model for a Cloudflare dashboard. Feishu/Sheets should come after the local/R2/D1 pipeline is reliable, because they are best treated as presentation sinks rather than data infrastructure.
