---
name: data
description: "Database layer for learner progress and vocabulary"
version: "2.0.0"
tags: [ielts, data, sqlite]
category: anya
---

# Learning Data Store

All persistent data is stored in SQLite via the `db` tool. Schema is auto-initialized from `templates/*.sql` on first access.

## Databases

| Name | Tables | Purpose |
|------|--------|---------|
| `learner` | `samples`, `errors`, `sample_words`, `plan` | Practice records, error tracking, weekly plans |
| `vocab` | `words`, `word_events` | Vocabulary notebook with SRS review |

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

### Get due vocabulary words
```
db name=vocab sql="SELECT word, definition, chinese, mastery FROM words WHERE mastery != 'mastered' AND (srs_due IS NULL OR srs_due <= datetime('now')) ORDER BY srs_due LIMIT ?" params='[5]'
```

### Lookup a word
```
db name=vocab sql="SELECT * FROM words WHERE word = ?" params='["resilient"]'
```

### Add a word
```
db name=vocab sql="INSERT INTO words (word, definition, chinese, ipa, pos, example, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'lookup', datetime('now'), datetime('now'))" params='["resilient", "able to recover quickly", "有弹性的", "/rɪˈzɪl.i.ənt/", "adj", "She proved resilient under pressure."]'
```

## Rules

1. **Use `db` tool directly** — no shell scripts needed.
2. **Tables are auto-created** from `schema/*.sql` on first access.
3. **Use parameterized queries** — pass values via `params`, not string concatenation.
4. **skill_type values**: `writing`, `speaking`, `reading`, `listening`, `daily`.
5. **Every training session → one sample record**, even if abandoned.
6. **Vocabulary data only in `vocab` db** — never store word data in MEMORY.md.
