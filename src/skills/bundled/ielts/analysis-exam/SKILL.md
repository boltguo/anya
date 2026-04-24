---
name: analysis-exam
description: "Analyze exam and mock results: band breakdown, history comparison, stability."
---

# Analysis — Exam

Read-only. Converts `mock_sessions` + exam-tagged `samples` into interpretable band movement.

## When to Use

- `模考分析 / 考试分析 / 历次考试对比 / 这次 vs 上次`
- Callback `analysis-exam`
- After any `*-exam` or `placement-full` when the learner wants a deeper look

For behaviour see `analysis-study`; for weaknesses see `analysis-weakness`; for actions see `analysis-recommend`.

## Workflow

1. Scope: most recent (default) / last 3 / this-vs-last based on phrasing.
2. Pull: `mock_sessions` + exam-tagged `samples` + linked `subcap_scores`.
3. Compute per-exam metrics (see `assets/exam-metrics.md`).
4. Render:
   - ≥ 2 exams → history compare (`assets/history-compare-template.md` Template A or B).
   - 1 exam → single-exam card (Template C).
   - Detailed / weekly / biweekly request → `assets/report-templates.md`.
5. Hand off to `analysis-recommend` or the matching `*-explain`.

Queries: `support/ielts-data-contract/references/queries.md`. Subcap keys: `analysis-weakness/assets/subcap-catalog.md`.

## Rules

1. **Read-only.** `learner-state` writes MEMORY.
2. **History needs ≥ 2 exams.** With 1, use the single-exam card.
3. **Quote evidence** for every trend claim.
4. **Hand off**, don't recommend drills inline.
5. **If no exam data**, route to `*-exam` skills.
