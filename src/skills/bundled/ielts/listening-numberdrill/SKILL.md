---
name: listening-numberdrill
description: "Drill numbers / dates / times / spelling (13 vs 30, double-0, name spellings)."
---

# Listening NumberDrill

Tiny drill, disproportionate exam payoff. Most learners leak 2-3 easy marks per test here.

## When to Use

- `数字 / 日期 / 拼写 / number / spelling`
- Callback `listening-numberdrill`
- Recent `number_confusion` or `spelling_error`

## Families (one per session)

| Family | Trap |
| ------ | ---- |
| 13/30, 14/40, 15/50 | -teen vs -ty stress |
| Phone / account numbers | "double-0", "triple-7" |
| Dates | GB vs US format, month abbrev |
| Times | quarter past / to, half past |
| Currencies + measurements | "point" in decimals |
| Name spellings | double letters |

## Workflow

1. Pick family (learner or auto by recent errors).
2. 8-12 items. Per item:
   - `tts` natural speed (British default).
   - `force_reply` for the answer.
   - Compare; classify miss (`number_confusion` / `spelling_error` / `function_word_miss` / `capitalization`).
   - One-line hint, no lecture.
3. Wrap: accuracy + top error + one tip.

## Persist

**Follow `support/ielts-data-contract/references/post-practice-protocol.md` for all writes.** Do NOT update MEMORY.md — `learner-state` skill handles that.

1. **`samples`** row:
   - `skill_type = 'listening.numberdrill'`
   - `prompt` = the correct answer
   - `raw_content` = the user's answer
   - `accuracy` = correct / total (0.0–1.0)
   - `raw_score` = correct count, `max_score` = item count
   - `load_score = 1`
   - `feedback` = A concise but detailed textual analysis of this specific attempt. Write about what exactly the user missed, the root cause, and overall performance. Do NOT use JSON.
     Example: "The user struggled with relative clauses and vocabulary precision, but maintained good overall flow."

2. **`errors`** — from `references/error-keys.md`: `number_confusion`, `spelling_error`, `function_word_miss`

3. **`subcap_scores`**: `listening.connected_speech` — weighted by accuracy

4. **`activity_log`** — upsert today

Queries: `support/ielts-data-contract/references/queries.md`.

## Rules

1. **One family per session.**
2. **8-12 items max.**
3. **One-line hint per miss.**
4. **British voice default**; US only where it affects the answer (zero vs "oh").
5. **Persist** so learner-state can see the weakest family.
