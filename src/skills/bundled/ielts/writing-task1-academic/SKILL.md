---
name: writing-task1-academic
description: "Academic Task 1 drill: chart / map / process with overview enforcement."
---

# Writing Task 1 (Academic)

20-min drill. Overview check is mandatory — missing it caps TA at 5.5.

## When to Use

- `Task 1 / 图表作文 / 流程图 / 地图描写 / academic task 1`
- Callback `writing-task1-academic`
- `writing.task_response` low on Academic Task 1 recent samples

## Chart types

Rotate across: line / bar / pie / table / map / process. Don't repeat same type back-to-back (check last 3 `samples WHERE prompt LIKE 'task1:%'`).

## Workflow

1. Generate chart via `image_gen` (or a map schematic).
2. `tg(type:"photo", ...)` with the prompt. Start clock.
3. `force_reply` ≥ 150 words.
4. Pre-checks: word count (< 150 → TR cap 5.0); overview presence (miss → `task1_overview_missing`, cap TR 5.5); wrong chart-type language (→ `word_choice`).
5. 4-criterion score with cited evidence (max 2 inline diffs `~strike~→**correct**`).
6. Top 2 fixes + Band-up example.
7. Micro drill + forced rewrite (max 2 attempts) of overview + comparison part.
8. On ≥ 0.5 band improvement → `react 🎉`.

## Persist

- 1 `samples` row + rewrite rows (`parent_sample_id`, same `prompt_hash`).
- `feedback={word_count, time_sec, chart_type, has_overview}`.
- `subcap_scores` all 7 writing keys.
- `errors`: `task1_overview_missing`, `word_choice`, `collocation_error`, `chinglish_transfer`, etc.
- Auto-harvest trend / comparison chunks.

Queries: `support/ielts-data-contract/references/queries.md`.

## Rules

1. **Chart variety.**
2. **Overview check mandatory.**
3. **Cited evidence per criterion.**
4. **Max 2 fixes + 1 Band-up + 1 rewrite (2 attempts).**
5. **Forced rewrite mandatory** unless first draft is 7.0+.
6. **Persist rewrite chains** via `prompt_hash` + `parent_sample_id`.
