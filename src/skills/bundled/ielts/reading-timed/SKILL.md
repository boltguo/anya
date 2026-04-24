---
name: reading-timed
description: "Single passage, hard 15-20 min window — pacing drill."
---

# Reading Timed

1 passage + 8-12 Qs with real clock. Goal is finishing on time, not just accuracy.

## When to Use

- `限时阅读 / 计时阅读 / 我想练速度`
- Callback `reading-timed`
- `reading.pace ≤ 5.5` OR recent `speed_too_slow`

## Passage profile

| Band | Words | Target | Qs |
| ---- | ----- | ------ | -- |
| < 5.0 | 350 | 15 min | 8 |
| 5.0-6.0 | 500-600 | 18 min | 10 |
| 6.0-7.0 | 650-750 | 20 min | 12 |
| 7.0+ | 800-900 | 20 min | 12-13 |

Question mix: TFNG or YNNG (3) + heading match (2) + completion / short (3) + MCQ (2). Include ≥ 1 paraphrase-dependent.

## Workflow

1. Consent + start (note timestamp).
2. Send passage + questions together.
3. `force_reply` with `1:T 2:NG 3:<word> ...`. Note submit time.
4. Compute `reading_time_sec`, `wpm`, `overtime` flag.
5. Bucket errors.
6. Report: time + wpm vs target + per-type hit rate + slow cause.
7. If `wpm < target` AND `accuracy < 0.7` → suggest `reading-skim-drill`.

## Persist

- 1 `samples` row (`load_score=3`, `feedback={reading_time_sec, wpm, word_count, q_accuracy, question_types, overtime}`).
- `subcap_scores.reading.pace` (dominant) + `.gist` + `.paraphrase_mapping`.
- `errors` + `speed_too_slow` if overtime.

Queries: `support/ielts-data-contract/references/queries.md`.

## Rules

1. **Real clock — submit time is what counts.**
2. **wpm + accuracy together.** Fast-and-wrong gets a strategy flag.
3. **One passage per session.**
4. **Overtime submissions still count.**
5. **Persist pace metrics** for trend tracking.
