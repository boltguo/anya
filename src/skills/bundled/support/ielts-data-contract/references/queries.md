# Common Query Recipes

Every query uses `db name=study`. Parameterise values via `params`, never string-concat.

## Samples — reads

```
# recent by skill
db name=study sql="SELECT id, created_at, skill_type, band_overall FROM samples WHERE skill_type = ? ORDER BY created_at DESC LIMIT ?" params='["writing", 10]'

# band trend (all skills)
db name=study sql="SELECT created_at, skill_type, band_overall FROM samples WHERE band_overall IS NOT NULL ORDER BY created_at DESC LIMIT ?" params='[20]'

# rewrite chain for a prompt
db name=study sql="SELECT id, created_at, band_overall, redo_count FROM samples WHERE prompt_hash = ? ORDER BY created_at ASC" params='["<hash>"]'

# stats overview
db name=study sql="SELECT skill_type, COUNT(*) AS c, ROUND(AVG(band_overall),1) AS avg_band FROM samples WHERE band_overall IS NOT NULL GROUP BY skill_type"

# today's consumed load
db name=study sql="SELECT COALESCE(SUM(load_score),0) AS consumed FROM samples WHERE created_at >= date('now') AND load_score > 0"
```

## Samples — writes

```
# record a practice session
db name=study sql="INSERT INTO samples (created_at, skill_type, prompt, raw_content, band_overall, session_id, feedback, parent_sample_id, redo_count, prompt_hash, load_score, session_window) VALUES (datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)" params='["writing", "Describe the chart...", "<essay>", 5.5, "sess-123", "{}", null, 0, "abc123def456", 3.0, "morning"]'
```

See `references/prompt-hash.md` for how to compute the 12-char `prompt_hash`.

## Errors

```
# write
db name=study sql="INSERT INTO errors (sample_id, recurrence_key, category, severity, original_phrase, correction) VALUES (?, ?, ?, ?, ?, ?)" params='[<id>, "tfng_logic_error", "reading", "medium", "...", "..."]'

# top recurring errors (window)
db name=study sql="SELECT recurrence_key, category, COUNT(*) AS c FROM errors WHERE sample_id IN (SELECT id FROM samples WHERE created_at >= date('now','-14 days')) GROUP BY recurrence_key ORDER BY c DESC LIMIT 10"
```

## Subcap scores

```
# write
db name=study sql="INSERT INTO subcap_scores (sample_id, subcap_key, score, evidence, created_at) VALUES (?, ?, ?, ?, datetime('now'))" params='[<id>, "writing.argument_depth", 5.0, "Assertions lack specifics"]'

# radar (last 14d, ascending — weakest first)
db name=study sql="SELECT subcap_key, ROUND(AVG(score),1) AS avg_score, COUNT(*) AS n FROM subcap_scores WHERE created_at >= date('now','-14 days') GROUP BY subcap_key ORDER BY avg_score ASC"
```

## Daily tasks

```
# write
db name=study sql="INSERT INTO daily_tasks (date, task_type, skill, mode, callback, load_score) VALUES (date('now'), ?, ?, ?, ?, ?)" params='["primary", "writing", "sentence-drill", "writing-sentence-drill", 2.0]'

# read today
db name=study sql="SELECT id, task_type, skill, mode, callback, load_score, completed FROM daily_tasks WHERE date = date('now') ORDER BY CASE task_type WHEN 'primary' THEN 1 WHEN 'review' THEN 2 ELSE 3 END"

# mark done
db name=study sql="UPDATE daily_tasks SET completed = 1, completed_at = datetime('now'), sample_id = ? WHERE id = ?" params='[<sample_id>, <task_id>]'
```

## Mock sessions / stage transitions

```
# record a full mock
db name=study sql="INSERT INTO mock_sessions (created_at, type, band_listening, band_reading, band_writing, band_speaking, band_overall, stability_score, notes) VALUES (datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?)" params='["full", 6.5, 6.0, 5.5, 6.0, 6.0, 0.35, ""]'

# record stage change
db name=study sql="INSERT INTO stage_transitions (changed_at, from_stage, to_stage, from_path, to_path, reason, snapshot_path) VALUES (datetime('now'), ?, ?, ?, ?, ?, ?)" params='["diagnose", "breakthrough", "B", "B", "primary_stable_2w", "memory_snapshots/2026-W16.md"]'
```

## Vocabulary

```
# due review (all item_kinds)
db name=study sql="SELECT word, chinese, ipa, pos, example_en, audio_path, transfer_level, item_kind FROM words WHERE mastery IN ('learning','known') AND srs_due IS NOT NULL AND srs_due <= datetime('now') ORDER BY is_user_word DESC, priority DESC, srs_due ASC LIMIT ?" params='[5]'

# queued new
db name=study sql="SELECT word, chinese, ipa, pos, example_en, audio_path, item_kind FROM words WHERE mastery = 'queued_new' ORDER BY priority DESC, created_at ASC LIMIT ?" params='[5]'

# count seeded inventory
db name=study sql="SELECT COUNT(*) AS queued_new_count FROM words WHERE mastery = 'queued_new'"

# lookup
db name=study sql="SELECT * FROM words WHERE word = ?" params='["resilient"]'

# insert a new item
db name=study sql="INSERT INTO words (word, definition, chinese, ipa, pos, example_en, mastery, origin, item_kind, source_sample_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'learning', ?, ?, ?, datetime('now'), datetime('now'))" params='["resilient", "able to recover quickly", "有弹性的", "/rɪˈzɪl.i.ənt/", "adj", "She proved resilient under pressure.", "user_lookup", "word", null]'

# update SRS counters after review
db name=study sql="UPDATE words SET review_count = review_count + 1, success_count = success_count + ?, fail_count = fail_count + ?, last_result = ?, last_seen_at = datetime('now'), srs_due = datetime('now', ?), updated_at = datetime('now') WHERE word = ?"

# injectable challenge words (topic + transfer_level ≥ 2)
db name=study sql="SELECT word, definition FROM words WHERE topics LIKE ? AND mastery IN ('learning','known') AND transfer_level >= 2 ORDER BY is_user_word DESC, priority DESC, srs_due ASC LIMIT ?" params='["%education%", 3]'

# event log
db name=study sql="INSERT INTO word_events (word, event_type, session_type, context, created_at) VALUES (?, ?, ?, ?, datetime('now'))" params='["resilient", "review_pass", "vocab-review", ""]'
```

## Paraphrase groups

```
# create
db name=study sql="INSERT INTO paraphrase_groups (topic, created_at) VALUES (?, datetime('now'))" params='["important"]'

# add member
db name=study sql="INSERT INTO paraphrase_members (group_id, word_id, register) VALUES (?, ?, ?)" params='[1, "crucial", "formal"]'

# read group
db name=study sql="SELECT pg.topic, pm.register, w.word, w.definition, w.example_en FROM paraphrase_groups pg JOIN paraphrase_members pm ON pg.id = pm.group_id JOIN words w ON pm.word_id = w.word WHERE pg.id = ?" params='[1]'
```

## Item-kind contract for `words`

| `item_kind` | `word` column holds | Notes |
| ----------- | ------------------- | ----- |
| `word` | single word | default |
| `chunk` | multi-word expression | frame + slot pattern |
| `pattern` | sentence frame | slots as placeholders |
| `personal_error` | wrong phrase | `definition` holds the correction |
| `paraphrase_group` | topic label | members live in `paraphrase_members` |

## Mastery / origin glossary

- `mastery`: `queued_new` → `learning` → `known` → `mastered`
- `origin`: `auto_seed` / `user_lookup` / `manual_save` / `practice_injected` / `briefing` / `auto_harvest`
- `transfer_level`: 0 seeded → 1 seen → 2 active-check pass → 3 spoke → 4 wrote
