---
name: database
description: "Database schema and query reference for learner progress and vocabulary"
---

# Learning Data Store

All persistent data is stored in SQLite via the `db` tool. Schema is auto-initialized from `templates/*.sql` on first access.

## Databases

| Name | Tables | Purpose |
|------|--------|---------|
| `learner` | `samples`, `errors`, `sample_words` | Practice records and error tracking |
| `vocab` | `words`, `word_events` | Vocabulary notebook, seeded queue, lookup history, and SRS review |

## Schema Discovery

If you don't remember the columns for a database, call `db` with **just** the name:

```
db name=learner            # → returns full schema for all tables in learner.db
db name=vocab              # → returns full schema for all tables in vocab.db
```

If a query fails (typo, wrong column), the error response automatically includes the schema for the tables in the failing SQL — read it and retry.

## Common Queries

### Record a practice session
```
db name=learner sql="INSERT INTO samples (created_at, skill_type, prompt, raw_content, band_overall, session_id, feedback) VALUES (datetime('now'), ?, ?, ?, ?, ?, ?)" params='["writing", "Describe the chart...", "The chart shows...", 5.5, "session-id", ""]'
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

### Get due review words
```
db name=vocab sql="SELECT word, chinese, ipa, pos, example_en, audio_path, transfer_level, review_count, success_count, fail_count FROM words WHERE mastery IN ('learning','known') AND srs_due IS NOT NULL AND srs_due <= datetime('now') ORDER BY is_user_word DESC, priority DESC, srs_due ASC LIMIT ?" params='[5]'
```

### Get queued new words
```
db name=vocab sql="SELECT word, chinese, ipa, pos, example_en, audio_path FROM words WHERE mastery = 'queued_new' ORDER BY priority DESC, created_at ASC LIMIT ?" params='[5]'
```

### Count seeded inventory
```
db name=vocab sql="SELECT COUNT(*) AS queued_new_count FROM words WHERE mastery = 'queued_new'"
```

### Lookup a word
```
db name=vocab sql="SELECT * FROM words WHERE word = ?" params='["resilient"]'
```

### Add a word
```
db name=vocab sql="INSERT INTO words (word, definition, chinese, ipa, pos, collocations, topics, source, origin, example_en, example_cn, audio_path, mastery, transfer_level, is_user_word, priority, lookup_count, review_count, success_count, fail_count, last_result, introduced_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))" params='["resilient", "able to recover quickly", "有弹性的", "/rɪˈzɪl.i.ənt/", "adj", "highly resilient; resilient economy", "work,education", "words", "user_lookup", "She proved resilient under pressure.", "她在压力下仍然表现得很坚韧。", "/tmp/resilient.ogg", "learning", 1, 1, 80, 1, 0, 0, 0, "lookup_saved"]'
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
5. **User-owned words** should set `is_user_word = 1` and usually higher `priority`.
6. **Cache pronunciation audio** in `audio_path` so later lookup/review can reuse it.
7. **Track interaction outcomes** in both `word_events` and the aggregated counters (`lookup_count`, `review_count`, `success_count`, `fail_count`, `last_result`).
8. **Every training session → one sample record**, even if abandoned.
9. **Vocabulary data only in `vocab` db** — never store word data in MEMORY.md.
