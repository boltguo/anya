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

> **STRICT PROHIBITION**: You are FORBIDDEN from using the `db` tool to write SQL. You MUST use the `persist` tool.

Call the `persist` tool natively with these JSON arguments:

```json
{
  "skill_type": "listening.numberdrill",
  "session_id": "<session>",
  "prompt": "<correct answer(s)>",
  "response": "<user's answer(s)>",
  "accuracy": "<correct / total>",
  "raw_score": "<correct count>",
  "max_score": "<item count>",
  "feedback": "<textual analysis>",
  "load_score": 1,
  "minutes": 1,
  "errors": "[{\"key\":\"number_confusion\",\"category\":\"listening\",\"original\":\"30\",\"correction\":\"13\",\"note\":\"teen/ty 混淆\"}]",
  "subcap_scores": "[{\"key\":\"listening.connected_speech\",\"score\":5.0,\"evidence\":\"...\"}]"
}
```

Error keys: `number_confusion`, `spelling_error`, `function_word_miss`

## Rules

1. **One family per session.**
2. **8-12 items max.**
3. **One-line hint per miss.**
4. **British voice default**; US only where it affects the answer (zero vs "oh").
5. **Persist** so learner-state can see the weakest family.
