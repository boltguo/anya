---
name: reading-typetrain
description: "Drill one question type at a time (TFNG, Heading, Matching, Completion, MCQ)."
---

# Reading TypeTrain

Single-type specialist. One type per session.

## When to Use

- `题型 / TFNG / Heading / Matching / MCQ / 专项`
- Callback `reading-typetrain`

## Types

| Type | Words | Items | Time |
| ---- | ----- | ----- | ---- |
| TFNG / YNNG | 400-500 | 6-8 | 10 min |
| Matching Headings | 450-550 | 5-6 | 10 min |
| Matching Features | 400-500 | 5-7 | 12 min |
| Sentence / Summary Completion | 400-500 | 6-8 | 10-12 min |
| Short Answer | 400-500 | 5-6 | 10 min |
| MCQ | 400-500 | 5-6 | 12 min |

## Workflow

1. Pick type (learner or auto from weakest in recent exam `feedback.question_accuracy`).
2. Show ≤ 5 lines of strategy for the chosen type (not a textbook).
3. Timed mini-session: passage + questions + `force_reply`.
4. Per-question explanation (right OR wrong) with evidence line + trap category (e.g. for TFNG: overreading "some" as "most").
5. Strategy recap: acc + top trap + next-time tip.
6. Difficulty keyboard.

## Persist

**Follow `support/ielts-data-contract/references/post-practice-protocol.md` for all writes.** Do NOT update MEMORY.md — `learner-state` skill handles that.

1. **`samples`** row:
   - `skill_type = 'reading.typetrain'`
   - `prompt` = the passage text
   - `raw_content` = user's answers (e.g. `"Q1:TRUE, Q2:FALSE, Q3:NG"`)
   - `accuracy` = correct / total (0.0–1.0)
   - `raw_score` = correct count, `max_score` = question count
   - `load_score = 2`
   - `feedback` = JSON:
     ```json
     {"type": "TFNG", "accuracy": 0.83, "items": 6, "correct": 5, "errors_by_type": {"tfng_logic_error": 1}, "session_notes": "NOT GIVEN 判断偏弱"}
     ```

2. **`errors`** — from `references/error-keys.md`:
   - `tfng_logic_error`, `heading_mismatch`, `keyword_matching_error`, `inference_error`, `detail_location_fail`

3. **`subcap_scores`**: `reading.gist` (Heading/Gist), `reading.paraphrase_mapping` (Completion), `reading.argument_structure` (Matching), `reading.author_attitude` (MCQ)

4. **`activity_log`** — upsert today

Queries: `support/ielts-data-contract/references/queries.md`.

## Rules

1. **One type per session.**
2. **Every question gets evidence** — right answers too.
3. **Strategy ≤ 5 lines.**
4. **Persist error family** so learner-state sees the weak type.
