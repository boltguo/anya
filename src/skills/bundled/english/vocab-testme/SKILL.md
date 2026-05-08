---
name: vocab-testme
description: "Active recall quiz on the learner's edge-of-knowledge items."
---

# Vocab TestMe

Pulls items near the edge of knowledge (not `mastered`) and tests in mixed formats.

## When to Use

- `考考我 / test me / 考考我最近学的`
- Callback `vocab-testme`
- After `vocab-topic` / `vocab-contextual`

## Workflow

1. Pull 6-8 candidates with `persist action="due_words"` (`limit=8`). Prefer items with weak recent recall. Do not use raw SQL.
2. Generate 6-8 questions using a mix of 5 formats (cycle, no format dominates):
   - Recall meaning (quiz, 4 Chinese options)
   - Produce sentence (force_reply)
   - Pick collocation (quiz)
   - Spot wrong usage (quiz, 4 sentences with 1 wrong)
   - Register pick (quiz, formal vs informal)
   - Paraphrase map (quiz)
3. Per question:
   - Quiz correct → ✅, call `persist action="word_review"` with `rating=4`.
   - Quiz wrong → ❌, call `persist action="word_review"` with `rating=1`.
   - Production → evaluate naturalness; pass = `rating=4`, shaky = `rating=3`, fail = `rating=1`.
   - One-line note per question.
4. Session report: stable / shaky / misused + top advice.

## Persist

**Follow `support/data-contract/references/post-practice-protocol.md` for all writes.** Do NOT update MEMORY.md — `learner-state` skill handles that.

1. **`samples`** row:
   - `skill_type = 'vocab'`, `prompt = 'testme-batch'`
   - `response` = per-question results (e.g. `"Q1:resilient=pass, Q2:fluctuate=fail"`)
   - `accuracy` = correct / total (0.0–1.0)
   - `raw_score` = correct count, `max_score` = question count
   - `load_score = 2`
   - `feedback` = A concise but detailed textual analysis of this specific attempt. Write about what exactly the user missed, the root cause, and overall performance. Do NOT use JSON.
     Example: "The user struggled with relative clauses and vocabulary precision, but maintained good overall flow."

2. **`word_review` actions** — update counters, SRS, mastery, and `word_reviews` per word.

3. **`activity_log`** — updated automatically by `persist`.

Queries: `support/data-contract/references/queries.md`.

## Rules

1. **Edge items only** — not `mastered`.
2. **5 formats, mixed.**
3. **1-line note per question.**
4. **Production graded generously** — any natural sentence counts.
5. **Cap at 8 items.**
