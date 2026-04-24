---
name: analysis-study
description: "Analyze study behaviour: total time, streak, coverage, consistency, imbalance."
---

# Analysis — Study Behaviour

Read-only. Answers "how am I studying" — not "how well." Catches drift before it shows up in bands.

## When to Use

- `我学了多久 / 我坚持几天了 / 我偏科了吗 / 学习情况 / study stats`
- Callback `analysis-study`
- `coach-proactive` weekly reflection

## Workflow

1. Window: default 14d; accept 7 / 14 / 30.
2. Pull: `samples` by day and skill, total load, daily-tasks completion, active-day set.
3. Compute metrics per `assets/study-metrics.md` (total, active_rate, streak, coverage %, load distribution, drought).
4. Apply `assets/consistency-rules.md` for verdicts (imbalance, streak, drought, task adherence, behaviour tag).
5. Render short report with imbalance flags.
6. One button → `[🎯 analysis-recommend]` `[🔄 coach-passive]` `[🏠 nav:main]`.

Queries: `support/ielts-data-contract/references/queries.md`.

## Rules

1. **No scores here.** Behaviour only.
2. **Windows default to 14d.**
3. **Imbalance is a fact, not a verdict** — report %, don't shame.
4. **Streak first** — most motivating number.
5. **If window is empty**, suggest a re-entry via `coach-passive`.
