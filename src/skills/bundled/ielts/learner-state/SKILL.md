---
name: learner-state
description: "Read and refresh the learner's bands and weak dimensions in MEMORY.md from recent study.db data."
---

# Learner State

Data-driven MEMORY refresh. Queries `study.db`, computes bands via EMA smoothing, and rewrites `MEMORY.md`. Never launches tests or gives advice.

## When to Use

- Daily cron (primary trigger — once per day)
- `我现在水平 / 我现在几分 / sync / refresh / 最近学得怎么样`
- Callback `learner-state` (from main menu)

NOT triggered after each practice. Training skills only write to `study.db`.

## Workflow

### Step 1 — Query study.db (5 fixed queries)

Run these in order. All use `db name=study`.

```sql
-- Q1: 14-day per-skill band average + sample count
SELECT skill_type, ROUND(AVG(band_overall),2) AS avg_band, COUNT(*) AS n
FROM samples WHERE band_overall IS NOT NULL
  AND created_at >= date('now','-14 days')
GROUP BY skill_type

-- Q2: 14-day subcap weak spots (avg < 5.0, n >= 2)
SELECT subcap_key, ROUND(AVG(score),1) AS avg_score, COUNT(*) AS n
FROM subcap_scores WHERE created_at >= date('now','-14 days')
GROUP BY subcap_key HAVING avg_score < 5.0 AND n >= 2
ORDER BY avg_score ASC

-- Q3: 14-day top 10 recurring errors
SELECT recurrence_key, category, COUNT(*) AS c
FROM errors WHERE sample_id IN
  (SELECT id FROM samples WHERE created_at >= date('now','-14 days'))
GROUP BY recurrence_key ORDER BY c DESC LIMIT 10

-- Q4: 7-day activity summary
SELECT COUNT(DISTINCT date) AS active_days,
  COALESCE(SUM(sessions_count),0) AS total_sessions,
  COALESCE(SUM(minutes_total),0) AS total_minutes
FROM activity_log WHERE date >= date('now','-7 days')

-- Q5: current MEMORY bands (EMA baseline)
memory target=memory action=read
```

### Step 2 — EMA Computation

For each skill_type from Q1:

```
α = min(0.6, n / 10)
new_band = α × db_avg + (1 - α) × memory_band
```

- When `memory_band = (not set)` → use `db_avg` directly
- Cap change at ±1.0 per refresh
- Round to nearest 0.5
- Overall = mean of 4 skills, rounded to 0.5

### Step 3 — Confidence Level

From total sample count across all skills:

- `n < 5` → `low`
- `5 ≤ n < 15` → `medium`
- `n ≥ 15` → `high`

### Step 4 — Write MEMORY.md

Update these sections via `memory target=memory action=replace`:

**Calibration:**
```
- profile_confidence: <low|medium|high>
- based_on: 14-day EMA (n=<total>)
- score_source: study.db aggregate
- latest_score_update: <today>
```

**IELTS Bands:** — computed values from Step 2

**Weak Dimensions:** — from Q2 subcap weak spots (only with evidence)

**Top Errors:** — from Q3 (top 5, format: `recurrence_key (category): count`)

**Study Consistency:** — from Q4:
```
- streak_days: <active_days>
- avg_weekly_sessions: <total_sessions>
```

### Step 5 — Write band_trend + activity_log

```sql
-- Upsert today's band per section
INSERT INTO band_trend (date, section, band_estimate, sample_count, source)
VALUES (date('now'), ?, ?, ?, 'learner-state')
ON CONFLICT(date, section) DO UPDATE SET
  band_estimate = excluded.band_estimate,
  sample_count = excluded.sample_count,
  source = excluded.source

-- Upsert today's activity
INSERT INTO activity_log (date, sessions_count, minutes_total, sections_touched, words_reviewed)
VALUES (date('now'), ?, ?, ?, ?)
ON CONFLICT(date) DO UPDATE SET
  sessions_count = excluded.sessions_count,
  minutes_total = excluded.minutes_total,
  sections_touched = excluded.sections_touched,
  words_reviewed = excluded.words_reviewed
```

### Step 6 — Output

- Cron invocation → `[SILENT]`, no message to user.
- User invocation → short summary: current bands, confidence, top weak dim, streak. Then buttons: `[🎯 next_best | 💬 coach-passive | 🏠 nav:main]`.

## What It Writes

- `Calibration.*` — confidence + data source + update date
- `IELTS Bands.*` — EMA-smoothed per-skill + overall + updated date
- `Weak Dimensions.*` — only with subcap evidence (Q2)
- `Top Errors.*` — top 5 from Q3
- `Study Consistency.streak_days`, `.avg_weekly_sessions`
- `band_trend` table — one row per section per day
- `activity_log` table — one row per day

Fields without new data evidence are preserved as-is.

## Rules

1. **No new tests.** Placement runs tests, not this.
2. **No advice.** Coach skills own that.
3. **Single MEMORY writer for bands** — placement + learner-state only.
4. **Never estimate — always compute.** Bands come from Q1 + EMA, not LLM judgment.
5. **Preserve fields without evidence.** Don't clear existing data.
6. **Cron invocation = silent.** No Telegram messages.
7. **Cap band swing at ±1.0 per refresh.** Prevents wild jumps.
8. **Coaching Strategy / Metacognition** may be supplemented with LLM observations based on query data, but bands/errors/weak dims must be pure computation.

Canonical subcap keys: `analysis-weakness/assets/subcap-catalog.md`.
Queries reference: `support/ielts-data-contract/references/queries.md`.
