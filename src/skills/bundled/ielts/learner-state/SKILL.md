---
name: learner-state
description: "Read and refresh the learner's bands and weak dimensions in MEMORY.md from recent study.db data."
---

# Learner State

Analysis only. Reads `study.db`, recomputes bands + weak dims + streak, writes `MEMORY.md`. Never launches new tests or gives advice.

## When to Use

- `我现在水平 / 我现在几分 / sync / refresh / 最近学得怎么样`
- Callback `learner-state` (from main menu)
- Daily / weekly cron MEMORY sync
- Any skill needs latest estimate before picking difficulty

## Workflow

1. Read recent samples / errors / subcap scores (last 7d for sync, 14d for deep review).
2. Recompute per-skill bands with EMA smoothing against current MEMORY value; round to 0.5; never swing > 1.0 on one session.
3. Refresh weak dimensions only when evidence is clear (≥ 3 matching errors OR subcap ≤ 4.5 with n ≥ 3).
4. Update streak + top errors + profile blocks (deep mode only).
5. Write MEMORY via `memory` tool.
6. **Upsert `band_trend`** — one row per section for today's date with the recomputed band estimate.
7. **Upsert `activity_log`** — aggregate today's sessions count, total minutes (from `duration_seconds`), sections touched, words reviewed.
8. Cron → `[SILENT]`. User → short summary + `[🎯 next_best | 💬 coach-passive | 🏠 nav:main]`.

Canonical keys from `analysis-weakness/assets/subcap-catalog.md` and `error-taxonomy.md`. Queries in `support/ielts-data-contract/references/queries.md`.

## What It Writes

- `IELTS Bands.{Speaking,Listening,Reading,Writing,Overall}` + `updated`
- `Weak Dimensions.*` (only with evidence)
- `Study Consistency.streak_days`, `avg_weekly_sessions`
- `Top Errors.*` top 5
- Deep review only: profile blocks, stability metrics

## Rules

1. **No new tests.** Placement runs tests, not this.
2. **No advice.** Coach skills own that.
3. **Single MEMORY writer for bands** — placement + learner-state only.
4. **Preserve fields without evidence.**
5. **Cron invocation = silent.**
6. **Detailed reports** delegate to `analysis-exam`.
