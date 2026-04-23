---
name: database
description: "Database schema and query reference for learner progress, vocabulary, and capability profiling"
---

# Learning Data Store

All persistent data is stored in SQLite via the `db` tool. Schema is auto-initialized from `templates/*.sql` on first access.

## Databases

| Name | Tables | Purpose |
|------|--------|---------|
| `learner` | `samples`, `errors`, `sample_words`, `subcap_scores`, `daily_tasks`, `mock_sessions`, `stage_transitions` | Practice records, error tracking, sub-capability profiling, task scheduling, mock exams, and stage progression |
| `vocab` | `words`, `word_events`, `paraphrase_groups`, `paraphrase_members` | Vocabulary notebook, SRS review, chunk/pattern storage, and synonym clusters |

## Schema Discovery

If you don't remember the columns for a database, call `db` with **just** the name:

```
db name=learner            # → returns full schema for all tables in learner.db
db name=vocab              # → returns full schema for all tables in vocab.db
```

If a query fails (typo, wrong column), the error response automatically includes the schema for the tables in the failing SQL — read it and retry.

## Schema Management

Schema files live in `templates/learner.sql` and `templates/vocab.sql`. They contain the complete, up-to-date schema with all tables and indexes.

**To apply schema changes**: regenerate the `.db` file from the `.sql` template and re-upload. No migration scripts needed.

## prompt_hash — Canonical Rule

`samples.prompt_hash` groups all rewrites of the same prompt. To keep chains intact, **every writer of a `samples` row must compute `prompt_hash` the same way**:

1. Take the **original prompt text only** — never include the learner's answer, instructions, or templating.
2. Lowercase the text.
3. Strip all punctuation (regex `[^\p{L}\p{N}\s]`) and collapse whitespace to single spaces; trim.
4. Compute `sha1`.
5. Take the first **12 hex chars** → this is the `prompt_hash`.

Reference implementation (TypeScript):

```ts
import { createHash } from "crypto";

function promptHash(prompt: string): string {
  const norm = prompt
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return createHash("sha1").update(norm).digest("hex").slice(0, 12);
}
```

**Rules**:
- Same prompt → same hash, regardless of capitalization, trailing punctuation, or added whitespace.
- A rewrite of the same task (`parent_sample_id IS NOT NULL`) **must** reuse the original's `prompt_hash`, not recompute it.
- Hash is **not** cryptographic identity — collisions are tolerable; the point is fast grouping.
- If the prompt itself is edited between attempts, start a new chain (new hash, no `parent_sample_id`).

## Common Queries

### Record a practice session

```
db name=learner sql="INSERT INTO samples (created_at, skill_type, prompt, raw_content, band_overall, session_id, feedback, parent_sample_id, redo_count, prompt_hash, load_score, session_window) VALUES (datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)" params='["writing", "Describe the chart...", "The chart shows...", 5.5, "session-id", "", null, 0, "abc123", 3.0, "morning"]'
```

### Get recent sessions by skill

```
db name=learner sql="SELECT id, created_at, skill_type, band_overall FROM samples WHERE skill_type = ? ORDER BY created_at DESC LIMIT ?" params='["writing", 10]'
```

### Stats overview

```
db name=learner sql="SELECT skill_type, COUNT(*) as count, ROUND(AVG(band_overall),1) as avg_band FROM samples WHERE band_overall IS NOT NULL GROUP BY skill_type"
```

### Top recurring errors

```
db name=learner sql="SELECT recurrence_key, category, COUNT(*) as count FROM errors GROUP BY recurrence_key ORDER BY count DESC LIMIT ?" params='[10]'
```

### Band trend

```
db name=learner sql="SELECT created_at, skill_type, band_overall FROM samples WHERE band_overall IS NOT NULL ORDER BY created_at DESC LIMIT ?" params='[20]'
```

### Rewrite chain (same-topic rewrites)

```
db name=learner sql="SELECT id, created_at, band_overall, redo_count FROM samples WHERE prompt_hash = ? ORDER BY created_at ASC" params='["<hash>"]'
```

### Write sub-capability scores

```
db name=learner sql="INSERT INTO subcap_scores (sample_id, subcap_key, score, evidence, created_at) VALUES (?, ?, ?, ?, datetime('now'))" params='[<sample_id>, "writing.argument_depth", 5.0, "Assertions lack specific examples"]'
```

### Read subcap trend for a key

```
db name=learner sql="SELECT sc.score, sc.created_at FROM subcap_scores sc JOIN samples s ON sc.sample_id = s.id WHERE sc.subcap_key = ? ORDER BY sc.created_at DESC LIMIT ?" params='["writing.argument_depth", 10]'
```

### Subcap radar (latest per key)

```
db name=learner sql="SELECT subcap_key, ROUND(AVG(score),1) as avg_score, COUNT(*) as n FROM subcap_scores WHERE created_at >= date('now', '-14 days') GROUP BY subcap_key ORDER BY avg_score ASC"
```

### Write today's tasks

```
db name=learner sql="INSERT INTO daily_tasks (date, task_type, skill, mode, callback, load_score) VALUES (date('now'), ?, ?, ?, ?, ?)" params='["primary", "writing", "sentence-lab", "writing:sentlab", 2.0]'
```

### Read today's tasks

```
db name=learner sql="SELECT id, task_type, skill, mode, callback, load_score, completed FROM daily_tasks WHERE date = date('now') ORDER BY CASE task_type WHEN 'primary' THEN 1 WHEN 'review' THEN 2 WHEN 'consolidation' THEN 3 END"
```

### Mark task completed

```
db name=learner sql="UPDATE daily_tasks SET completed = 1, completed_at = datetime('now'), sample_id = ? WHERE id = ?" params='[<sample_id>, <task_id>]'
```

### Today's consumed load

```
db name=learner sql="SELECT COALESCE(SUM(load_score), 0) as consumed FROM samples WHERE created_at >= date('now') AND load_score > 0"
```

### Record a mock exam session

```
db name=learner sql="INSERT INTO mock_sessions (created_at, type, band_listening, band_reading, band_writing, band_speaking, band_overall, stability_score, notes) VALUES (datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?)" params='["full", 6.5, 6.0, 5.5, 6.0, 6.0, 0.35, ""]'
```

### Record stage transition

```
db name=learner sql="INSERT INTO stage_transitions (changed_at, from_stage, to_stage, from_path, to_path, reason, snapshot_path) VALUES (datetime('now'), ?, ?, ?, ?, ?, ?)" params='["diagnose", "breakthrough", "B", "B", "primary_stable_2w criteria met", "memory_snapshots/2026-W16.md"]'
```

### Get due review words

```
db name=vocab sql="SELECT word, chinese, ipa, pos, example_en, audio_path, transfer_level, review_count, success_count, fail_count, item_kind FROM words WHERE mastery IN ('learning','known') AND srs_due IS NOT NULL AND srs_due <= datetime('now') ORDER BY is_user_word DESC, priority DESC, srs_due ASC LIMIT ?" params='[5]'
```

### Get queued new words

```
db name=vocab sql="SELECT word, chinese, ipa, pos, example_en, audio_path, item_kind FROM words WHERE mastery = 'queued_new' ORDER BY priority DESC, created_at ASC LIMIT ?" params='[5]'
```

### Count seeded inventory

```
db name=vocab sql="SELECT COUNT(*) AS queued_new_count FROM words WHERE mastery = 'queued_new'"
```

### Lookup a word

```
db name=vocab sql="SELECT * FROM words WHERE word = ?" params='["resilient"]'
```

### Add a word (with item_kind)

```
db name=vocab sql="INSERT INTO words (word, definition, chinese, ipa, pos, collocations, topics, source, origin, example_en, example_cn, audio_path, mastery, transfer_level, is_user_word, priority, lookup_count, review_count, success_count, fail_count, last_result, item_kind, source_sample_id, introduced_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))" params='["resilient", "able to recover quickly", "有弹性的", "/rɪˈzɪl.i.ənt/", "adj", "highly resilient; resilient economy", "work,education", "words", "user_lookup", "She proved resilient under pressure.", "她在压力下仍然表现得很坚韧。", "/tmp/resilient.ogg", "learning", 1, 1, 80, 1, 0, 0, 0, "lookup_saved", "word", null]'
```

### Add a chunk / pattern / personal_error

```
db name=vocab sql="INSERT INTO words (word, definition, chinese, pos, collocations, topics, source, origin, example_en, mastery, item_kind, source_sample_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'learning', ?, ?, datetime('now'), datetime('now'))" params='["take ... into account", "to consider sth", "考虑到", "chunk", "take factors into account", "academic", "practice", "auto_harvest", "We must take all factors into account.", "chunk", 42]'
```

### Create a paraphrase group

```
db name=vocab sql="INSERT INTO paraphrase_groups (topic, created_at) VALUES (?, datetime('now'))" params='["important"]'
```

### Add member to group

```
db name=vocab sql="INSERT INTO paraphrase_members (group_id, word_id, register) VALUES (?, ?, ?)" params='[1, "crucial", "formal"]'
```

### Review paraphrase group

```
db name=vocab sql="SELECT pg.topic, pm.register, w.word, w.definition, w.example_en FROM paraphrase_groups pg JOIN paraphrase_members pm ON pg.id = pm.group_id JOIN words w ON pm.word_id = w.word WHERE pg.id = ?" params='[1]'
```

### Update review counters

```
db name=vocab sql="UPDATE words SET review_count = review_count + 1, success_count = success_count + 1, last_result = ?, last_seen_at = datetime('now'), updated_at = datetime('now') WHERE word = ?" params='["review_pass", "resilient"]'
```

### Get injectable challenge words

```
db name=vocab sql="SELECT word, definition FROM words WHERE topics LIKE ? AND mastery IN ('learning','known') AND transfer_level >= 2 ORDER BY is_user_word DESC, priority DESC, srs_due ASC LIMIT ?" params='["%education%", 3]'
```

## Rules

1. **Use `db` tool directly** — no shell scripts needed.
2. **Tables are auto-created** from `templates/*.sql` on first access.
3. **Use parameterized queries** — pass values via `params`, not string concatenation.
4. **Vocabulary states**:
   `queued_new` = seeded but not taught,
   `learning` = introduced and in SRS,
   `known` = usable and still reviewed,
   `mastered` = stable.
5. **Item kinds** (vocab):
   `word` = single word,
   `chunk` = multi-word expression,
   `pattern` = sentence frame with slots,
   `paraphrase_group` = cluster label,
   `personal_error` = learner's recurring wrong expression.
6. **User-owned words** should set `is_user_word = 1` and usually higher `priority`.
7. **Cache pronunciation audio** in `audio_path` so later lookup/review can reuse it.
8. **Track interaction outcomes** in both `word_events` and the aggregated counters (`lookup_count`, `review_count`, `success_count`, `fail_count`, `last_result`).
9. **Every training session → one sample record**, even if abandoned.
10. **Vocabulary data only in `vocab` db** — never store word data in MEMORY.md.
11. **Subcap scores** must use keys from `assessment/references/subcap_catalog.md` — no ad-hoc keys.
12. **Rewrite chains** use `parent_sample_id` to link a rewrite to its original. The `prompt_hash` field groups all rewrites of the same prompt for trend analysis.
13. **Load scores** are written per sample. Read `SUM(load_score)` for today to enforce the daily budget.
14. **Daily tasks** are marked completed by training skills after session recording.
