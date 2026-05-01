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

- 1 `samples` row (`load_score=1`, `feedback={family, acc, items_n}`).
- `subcap_scores.listening.connected_speech` weighted by accuracy when family is numbers / phones / times.
- `errors` per miss.

Queries: `support/ielts-data-contract/references/queries.md`.

## Rules

1. **One family per session.**
2. **8-12 items max.**
3. **One-line hint per miss.**
4. **British voice default**; US only where it affects the answer (zero vs "oh").
5. **Persist** so learner-state can see the weakest family.
