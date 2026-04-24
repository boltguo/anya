---
name: reading-exam
description: "Full IELTS Reading mock: 3 passages, 40 questions, 60 min."
---

# Reading Exam

60 min unbroken. Academic by default; GT if `Goals.exam_type = general`.

## When to Use

- `阅读模考 / full reading / mock reading`
- Callback `reading-exam`
- Exam-close rehearsal

## Structure

| Passage | Topic | Qs |
| ------- | ----- | -- |
| 1 | accessible, everyday | ~13 |
| 2 | work / society | ~13-14 |
| 3 | academic / research | ~13-14 |

Band-mapping + full workflow in `references/workflow.md`.

## Workflow (summary)

1. Consent card. Note start timestamp.
2. Per passage: send passage + questions together, collect `force_reply` with `1:T 2:F 3:NG 4:<word> ...`. No mid-passage grading.
3. After P3: stop clock. Grade `/40` → band using Academic or GT mapping.
4. Bucket errors by question type + root cause.
5. Report: per-passage accuracy + per-type hit rate + Top 2 fix suggestions.
6. Persist: 1 `samples` row per passage (shared `session_id`), `feedback={reading_time_sec, question_accuracy, re_reads, location_accuracy, wpm, question_types}`, subcap scores, canonical errors.
7. Hand off: `[🔍 reading-explain]  [🎯 reading-typetrain]  [🏠 nav:main]`.

Queries: `support/ielts-data-contract/references/queries.md`.

## Scoring Reference

Before converting raw /40 to band, load: `skill_view name=ielts-band-descriptors file=references/score-conversion.md`

## Rules

1. **60 min clock is real.**
2. **Passage + questions together.**
3. **Passage locked once learner submits.**
4. **Record wpm + location accuracy + re-read count** in `feedback`.
5. **Academic vs GT mapping per `Goals.exam_type`.**
6. **Subcap + error keys canonical.**
7. **No MEMORY writes.**
