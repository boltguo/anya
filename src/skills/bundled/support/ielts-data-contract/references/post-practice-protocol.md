# Post-Practice Write Protocol

Every training skill **must** write to `study.db` after each practice session.
MEMORY.md is refreshed separately by `learner-state` — do NOT update MEMORY directly.

## Mandatory Writes (in order)

### 1. Insert `samples` row

```sql
INSERT INTO samples (
  created_at, skill_type, prompt, raw_content,
  accuracy, raw_score, max_score,
  band_overall, session_id, feedback, mode, completed,
  duration_seconds, load_score, session_window, audio_path
) VALUES (
  datetime('now'), ?, ?, ?,
  ?, ?, ?,
  ?, ?, ?, ?, ?,
  ?, ?, ?, ?
)
```

**Field rules:**

| Field | Required | Notes |
|-------|----------|-------|
| `skill_type` | ✅ | e.g. `listening.dictation`, `speaking.freetalk`, `writing.essay` |
| `prompt` | ✅ | The question / source text / topic given to the user. **Never leave empty.** |
| `raw_content` | ✅ | The user's raw response (typed text, transcription, etc.). **Never leave empty.** |
| `accuracy` | ✅ for scored | 0.0–1.0 float. `NULL` for unscored activities (daily-article, material-discussion). |
| `raw_score` | ✅ for scored | Items correct (numerator). |
| `max_score` | ✅ for scored | Items total (denominator). |
| `band_overall` | optional | Only for writing/speaking band-scored tasks. |
| `feedback` | ✅ | **Natural language textual analysis.** Write a detailed diagnostic paragraph. Do not use JSON. |
| `audio_path` | if applicable | For listening skills with TTS — essential for Revenge Protocol. |
| `mode` | ✅ | `study` (default) \| `exam` \| `placement` |
| `completed` | ✅ | `1` = finished, `0` = abandoned. **Write even if abandoned.** |

### 2. Insert `errors` rows

One row per distinct error detected. **Keys must come from `references/error-keys.md`.**

```sql
INSERT INTO errors (sample_id, recurrence_key, category, severity, original_phrase, correction, rule_note)
VALUES (?, ?, ?, ?, ?, ?, ?)
```

- `recurrence_key`: **Must** be from the canonical list in `references/error-keys.md`
- `category`: `listening` | `reading` | `writing` | `speaking` | `grammar` | `vocabulary`
- `severity`: `low` | `medium` | `high`

### 3. Insert `subcap_scores` rows

One row per sub-capability assessed:

```sql
INSERT INTO subcap_scores (sample_id, subcap_key, score, evidence, created_at)
VALUES (?, ?, ?, ?, datetime('now'))
```

### 4. Upsert `activity_log`

```sql
INSERT INTO activity_log (date, sessions_count, minutes_total, sections_touched)
VALUES (date('now'), 1, ?, ?)
ON CONFLICT(date) DO UPDATE SET
  sessions_count = activity_log.sessions_count + 1,
  minutes_total = activity_log.minutes_total + excluded.minutes_total,
  sections_touched = CASE
    WHEN activity_log.sections_touched = '' THEN excluded.sections_touched
    WHEN INSTR(activity_log.sections_touched, excluded.sections_touched) > 0 THEN activity_log.sections_touched
    ELSE activity_log.sections_touched || ',' || excluded.sections_touched
  END
```

## Getting sample_id

After INSERT into `samples`, get the ID for linking errors and subcap_scores:

```
db name=study sql="SELECT last_insert_rowid() AS sample_id"
```

---

## Feedback Spec

`feedback` must be a natural language textual analysis. Do not use JSON. 
Write a concise but detailed diagnostic paragraph about what exactly the user missed, the root cause, and overall performance.

Example: "The user missed the definite article 'the' and heard 'released' as 'release'. This indicates weak sensitivity to word-final sounds and connected speech of weak forms, though they successfully caught the main sentence structure."

---

## Complete Examples

### Example: listening.dictation

```
-- 1. samples
db name=study sql="INSERT INTO samples (created_at, skill_type, prompt, raw_content, accuracy, raw_score, max_score, session_id, feedback, mode, completed, duration_seconds, load_score, audio_path) VALUES (datetime('now'), 'listening.dictation', 'The software engineer is coding a new game.', 'The soft engineer was coding new game', 0.5, 3, 6, 'tg:12345', 'The user missed the definite article a and heard software as soft. This indicates weak sensitivity to word-final sounds and function words.', 'study', 1, 45, 2, '/path/to/audio.ogg')"

-- 2. get sample_id
db name=study sql="SELECT last_insert_rowid() AS sample_id"

-- 3. errors (one per miss)
db name=study sql="INSERT INTO errors (sample_id, recurrence_key, category, severity, original_phrase, correction, rule_note) VALUES (?, 'lexical_substitution', 'listening', 'medium', 'soft', 'software', '完整词汇未听清，截断了后半部分')" params='[42]'
db name=study sql="INSERT INTO errors (sample_id, recurrence_key, category, severity, original_phrase, correction, rule_note) VALUES (?, 'verb_form_error', 'grammar', 'medium', 'was coding', 'is coding', '时态错误：原文用现在进行时')" params='[42]'
db name=study sql="INSERT INTO errors (sample_id, recurrence_key, category, severity, original_phrase, correction, rule_note) VALUES (?, 'function_word_miss', 'grammar', 'medium', '', 'a', '冠词 a 在弱读位置被忽略')" params='[42]'

-- 4. subcap_scores
db name=study sql="INSERT INTO subcap_scores (sample_id, subcap_key, score, evidence, created_at) VALUES (?, 'listening.connected_speech', 4.5, '弱读冠词和词尾辅音遗漏', datetime('now'))" params='[42]'

-- 5. activity_log
db name=study sql="INSERT INTO activity_log (date, sessions_count, minutes_total, sections_touched) VALUES (date('now'), 1, 1, 'listening') ON CONFLICT(date) DO UPDATE SET sessions_count = activity_log.sessions_count + 1, minutes_total = activity_log.minutes_total + excluded.minutes_total, sections_touched = CASE WHEN activity_log.sections_touched = '' THEN excluded.sections_touched WHEN INSTR(activity_log.sections_touched, excluded.sections_touched) > 0 THEN activity_log.sections_touched ELSE activity_log.sections_touched || ',' || excluded.sections_touched END"
```

### Example: speaking.freetalk

```
db name=study sql="INSERT INTO samples (created_at, skill_type, prompt, raw_content, accuracy, session_id, feedback, mode, completed, duration_seconds, load_score) VALUES (datetime('now'), 'speaking.freetalk', 'Should AI replace human teachers?', 'I think AI can help but not replace teachers because...', NULL, 'tg:12345', 'The user maintained good flow but lacked advanced vocabulary. There were a few filler words used.', 'study', 1, 180, 2)"

db name=study sql="SELECT last_insert_rowid() AS sample_id"

db name=study sql="INSERT INTO errors (sample_id, recurrence_key, category, severity, original_phrase, correction, rule_note) VALUES (?, 'verb_form_error', 'grammar', 'medium', 'I think AI can helps', 'I think AI can help', '情态动词后用原形')" params='[43]'

db name=study sql="INSERT INTO subcap_scores (sample_id, subcap_key, score, evidence, created_at) VALUES (?, 'speaking.fluency', 5.5, '中等停顿，3次填充词', datetime('now'))" params='[43]'
db name=study sql="INSERT INTO subcap_scores (sample_id, subcap_key, score, evidence, created_at) VALUES (?, 'speaking.lexical_variety', 5.0, '基础词汇为主，缺少话题相关高级表达', datetime('now'))" params='[43]'

db name=study sql="INSERT INTO activity_log (date, sessions_count, minutes_total, sections_touched) VALUES (date('now'), 1, 3, 'speaking') ON CONFLICT(date) DO UPDATE SET sessions_count = activity_log.sessions_count + 1, minutes_total = activity_log.minutes_total + excluded.minutes_total, sections_touched = CASE WHEN activity_log.sections_touched = '' THEN excluded.sections_touched WHEN INSTR(activity_log.sections_touched, excluded.sections_touched) > 0 THEN activity_log.sections_touched ELSE activity_log.sections_touched || ',' || excluded.sections_touched END"
```

### Example: vocab (review / testme)

```
db name=study sql="INSERT INTO samples (created_at, skill_type, prompt, raw_content, accuracy, raw_score, max_score, session_id, feedback, mode, completed, load_score) VALUES (datetime('now'), 'vocab', 'review-batch', 'resilient:pass, fluctuate:fail, elaborate:pass', 0.83, 5, 6, 'tg:12345', 'The user successfully recalled most words but struggled with the production of the word fluctuate.', 'study', 1, 2)"

db name=study sql="SELECT last_insert_rowid() AS sample_id"

-- Update word SRS counters (per word)
db name=study sql="UPDATE words SET review_count = review_count + 1, success_count = success_count + 1, last_result = 'pass', last_seen_at = datetime('now'), srs_due = datetime('now', '+3 days'), updated_at = datetime('now') WHERE word = ?" params='["resilient"]'

-- Word event
db name=study sql="INSERT INTO word_events (word, event_type, session_type, context, created_at) VALUES (?, 'review_pass', 'vocab-review', '', datetime('now'))" params='["resilient"]'

db name=study sql="INSERT INTO activity_log (date, sessions_count, minutes_total, sections_touched, words_reviewed) VALUES (date('now'), 1, 3, 'vocab', 6) ON CONFLICT(date) DO UPDATE SET sessions_count = activity_log.sessions_count + 1, minutes_total = activity_log.minutes_total + excluded.minutes_total, words_reviewed = activity_log.words_reviewed + excluded.words_reviewed"
```

## Do NOT

- Do NOT update MEMORY.md directly — `learner-state` skill handles that
- Do NOT skip writes for abandoned sessions — write `completed=0`
- Do NOT invent error keys — use `references/error-keys.md`
- Do NOT use JSON in `feedback` — must be natural language analysis
- Do NOT leave `prompt` or `raw_content` empty
