---
name: assessment
description: 'Internal learning-state analysis skill: analyze recent learner.db practice data, recompute IELTS band ranges and weak dimensions, and update MEMORY.md. Use whenever the user asks to refresh, sync, analyze, or review their current English level or recent learning data, and whenever cron needs to silently update MEMORY from practice records. This is not a test, not a mock exam, and should not create new exam tasks.'
---

# Assessment Engine — Learning State Sync

## Purpose

This skill exists to do one thing well:

- analyze existing learning data in `learner.db`
- infer the learner's current level and weak points
- update `MEMORY.md`

It is a **dedicated analyzer**, not a user-facing test flow.

Do **not** use this skill to:

- launch mock exams
- generate fresh assessment questions
- force the learner through a visible "测评"
- create weekly exam-style reports unless the user explicitly asks

## When to Use

- learner says "更新一下我的水平", "分析我最近学得怎么样", "refresh my level", "sync my memory", "看看我最近的英语状态"
- daily cron needs a silent sync from recent practice records
- weekly cron needs a deeper recalibration from recent samples
- another skill needs the latest level estimate before selecting difficulty

Never call this from the middle of a single training session. Training skills record data; `assessment` aggregates it later.

## Resources

- `references/error_taxonomy.md`
- `references/subcap_catalog.md`
- `templates/report.md` only if the user explicitly asks for a detailed report

## Modes

### 1. Sync Mode (default)

Used for:

- daily cron
- manual "refresh/sync my level" requests

Behavior:

- silent if cron-triggered
- concise summary if user-triggered

### 2. Deep Review Mode

Used for:

- weekly cron recalibration
- user explicitly asks for a more detailed analysis of recent progress

Behavior:

- analyze a longer window
- update more profile fields
- still keep the output concise unless the user explicitly asks for details

## Data Inputs

Primary source: `learner.db`

Use the `db` tool only.

Core queries:

```sql
db name=learner sql="SELECT id, created_at, skill_type, band_task, band_coherence, band_lexical, band_grammar, band_overall, redo_count, feedback FROM samples WHERE created_at >= date('now','-14 days') ORDER BY created_at DESC"
```

```sql
db name=learner sql="SELECT recurrence_key, category, COUNT(*) as cnt FROM errors WHERE sample_id IN (SELECT id FROM samples WHERE created_at >= date('now','-14 days')) GROUP BY recurrence_key, category ORDER BY cnt DESC LIMIT 30"
```

```sql
db name=learner sql="SELECT subcap_key, ROUND(AVG(score),1) as avg_score, COUNT(*) as n FROM subcap_scores WHERE created_at >= date('now','-14 days') GROUP BY subcap_key ORDER BY avg_score ASC"
```

```sql
db name=learner sql="SELECT DISTINCT date(created_at) as d FROM samples ORDER BY d DESC LIMIT 30"
```

Read `USER.md` and current `MEMORY.md` before writing anything.

## Derivation Rules

### IELTS Bands

Compute per-skill bands from recent samples:

- window:
  - Sync mode: last 7 days
  - Deep review mode: last 14 days
- weight recent samples more heavily
- samples with `redo_count = 0` can be treated as slightly less reliable
- use broad, stable updates; never swing too hard off one bad session

Recommended practical rule:

- if there are no recent samples for a skill, keep the existing MEMORY value
- if there are recent samples, compute a weighted mean
- smooth against the previous MEMORY value
- round to the nearest `0.5`

Update:

- `IELTS Bands.Speaking`
- `IELTS Bands.Listening`
- `IELTS Bands.Reading`
- `IELTS Bands.Writing`
- `IELTS Bands.Overall`
- `IELTS Bands.updated`

### Weak Dimensions

Infer from:

- recent `errors`
- low `subcap_scores`
- repeated difficulty feedback

Update only when evidence is clear:

- `Weak Dimensions.Writing`
- `Weak Dimensions.Speaking`
- `Weak Dimensions.Listening`
- `Weak Dimensions.Reading`

### Profile Blocks

Refresh only when enough data exists:

- `Vocabulary Profile.*`
- `Grammar Profile.*`
- `Speaking Profile.*`
- `Listening Profile.*`
- `Reading Profile.*`
- `Writing Profile.*`

Do not invent details from thin data.

### Study Consistency

Update:

- `Study Consistency.streak_days`
- `Study Consistency.avg_weekly_sessions`

### Top Errors

Update the top recurring error keys from recent data.

## Protocol

1. Read `USER.md`
2. Read `MEMORY.md`
3. Query recent samples, errors, subcap scores, and consistency data
4. Decide whether this run is `sync` or `deep review`
5. Recompute the learner's current per-skill and overall band range
6. Recompute weak dimensions and clear profile updates supported by evidence
7. Write the updated `MEMORY.md` through the `memory` tool
8. If user-triggered, send a short summary
9. If cron-triggered, return `[SILENT]`

## User-Facing Output

If the user explicitly triggered this skill, keep the reply short:

```text
我已经按最近的练习记录更新了你的水平画像。

- 🗣️ 口语：{{speaking_band}}
- 🎧 听力：{{listening_band}}
- 📖 阅读：{{reading_band}}
- ✍️ 写作：{{writing_band}}

当前更该优先补的是：{{top_weak_area}}
接下来练 {{next_best_skill}} 会更划算。
```

Do not frame it like a test result.

## Rules

1. **This skill analyzes existing data only.** No new quiz, no mock, no forced assessment.
2. **MEMORY updates are centralized here.** Training skills should record raw evidence; `assessment` does the aggregation.
3. **Only update fields supported by data.** If the evidence is weak, preserve the existing MEMORY value.
4. **Keep band updates stable.** Use smoothing and broad rounding.
5. **No exam-style pressure language.** This is coaching infrastructure, not a score ceremony.
6. **If cron-triggered, stay silent.**
7. **Use `templates/report.md` only when the user explicitly asks for a detailed review.**
