# Post-Practice Write Protocol

Every training skill **must** write to `study.db` after each practice session. MEMORY.md is refreshed separately by daily cron via `learner-state` — do NOT update MEMORY directly.

## Required Writes (in order)

### 1. Insert `samples` row

```sql
INSERT INTO samples (
  created_at, skill_type, prompt, raw_content,
  band_overall, session_id, feedback, mode, completed,
  duration_seconds, load_score, session_window
) VALUES (
  datetime('now'), ?, ?, ?,
  ?, ?, ?, ?, ?,
  ?, ?, ?
)
```

- `skill_type`: `speaking` | `listening` | `reading` | `writing`
- `mode`: `study` (default) | `exam` | `placement`
- `completed`: `1` = finished, `0` = abandoned
- `feedback`: JSON string with skill-specific metrics (e.g. `{"first_pct": 0.6, "final_pct": 0.9}`)
- `load_score`: difficulty weight (typically 1-5)
- If abandoned (`completed=0`), still write this row

### 2. Insert `errors` rows

One row per distinct error detected:

```sql
INSERT INTO errors (sample_id, recurrence_key, category, severity, original_phrase, correction, rule_note)
VALUES (?, ?, ?, ?, ?, ?, ?)
```

- `recurrence_key`: canonical key from `analysis-weakness/assets/error-taxonomy.md`
- `category`: `speaking` | `listening` | `reading` | `writing` | `grammar` | `vocabulary`
- `severity`: `low` | `medium` | `high`
- Always use canonical keys, not free-text descriptions

### 3. Insert `subcap_scores` rows

One row per sub-capability assessed:

```sql
INSERT INTO subcap_scores (sample_id, subcap_key, score, evidence, created_at)
VALUES (?, ?, ?, ?, datetime('now'))
```

- `subcap_key`: canonical key from `analysis-weakness/assets/subcap-catalog.md` (e.g. `speaking.fluency`, `writing.argument_depth`)
- `score`: 0.0–9.0 (IELTS scale)
- `evidence`: one-sentence justification

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

## Do NOT

- Do NOT update MEMORY.md directly — `learner-state` cron handles that
- Do NOT skip writes for abandoned sessions — write `completed=0`
- Do NOT invent error keys — use canonical taxonomy
- Do NOT estimate band scores loosely — use the official IELTS rubrics loaded via `skill_view`

## Getting sample_id

After INSERT into `samples`, get the ID for linking errors and subcap_scores:

```
db name=study sql="SELECT last_insert_rowid() AS sample_id"
```

Use this `sample_id` in all subsequent INSERT calls for `errors` and `subcap_scores`.

## Complete Example (speaking-freetalk)

```
db name=study sql="INSERT INTO samples (created_at, skill_type, prompt, raw_content, band_overall, session_id, feedback, mode, completed, duration_seconds, load_score, session_window) VALUES (datetime('now'), 'speaking', 'Describe a hobby', 'I like play basketball very much...', 5.5, 'tg:12345', '{\"duration_sec\":85,\"filler_count\":4,\"pause_ratio\":0.18}', 'study', 1, 85, 2, 'evening')"

db name=study sql="SELECT last_insert_rowid() AS sample_id"

db name=study sql="INSERT INTO errors (sample_id, recurrence_key, category, severity, original_phrase, correction, rule_note) VALUES (42, 'verb_form_error', 'grammar', 'medium', 'I like play basketball', 'I like playing basketball', 'gerund after like/enjoy/avoid')"

db name=study sql="INSERT INTO subcap_scores (sample_id, subcap_key, score, evidence, created_at) VALUES (42, 'speaking.fluency', 5.5, 'Moderate pauses between clauses, 4 fillers in 85s', datetime('now'))"

db name=study sql="INSERT INTO subcap_scores (sample_id, subcap_key, score, evidence, created_at) VALUES (42, 'speaking.lexical_variety', 5.0, 'Basic vocabulary, no topic-specific collocations', datetime('now'))"

db name=study sql="INSERT INTO activity_log (date, sessions_count, minutes_total, sections_touched) VALUES (date('now'), 1, 2, 'speaking') ON CONFLICT(date) DO UPDATE SET sessions_count = activity_log.sessions_count + 1, minutes_total = activity_log.minutes_total + excluded.minutes_total, sections_touched = CASE WHEN activity_log.sections_touched = '' THEN excluded.sections_touched WHEN INSTR(activity_log.sections_touched, excluded.sections_touched) > 0 THEN activity_log.sections_touched ELSE activity_log.sections_touched || ',' || excluded.sections_touched END"
```

