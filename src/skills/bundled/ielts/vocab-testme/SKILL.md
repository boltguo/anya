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

1. Pull 6-8 candidates from `mastery IN ('learning','known')` ordered by `(fail_count - success_count) DESC, last_seen_at DESC`. Also pick 1-2 `paraphrase_groups` for register/choice questions.
2. Generate 6-8 questions using a mix of 5 formats (cycle, no format dominates):
   - Recall meaning (quiz, 4 Chinese options)
   - Produce sentence (force_reply)
   - Pick collocation (quiz)
   - Spot wrong usage (quiz, 4 sentences with 1 wrong)
   - Register pick (quiz, formal vs informal)
   - Paraphrase map (quiz)
3. Per question:
   - Quiz correct → ✅, `success_count++`, push `srs_due` forward.
   - Quiz wrong → ❌, `fail_count++`, `srs_due = +1d`.
   - Production → evaluate naturalness; same counter updates.
   - One-line note per question.
4. Session report: stable / shaky / misused + top advice.

## Persist

- 1 `samples` row (`skill_type='vocab'`, `prompt='testme-batch'`, `load_score=2`, `feedback={items, per_q_results}`).
- Update `words` counters + `srs_due`.
- `word_events` rows.
- Good production sentence → bump `transfer_level` to 3-4.

Queries: `support/ielts-data-contract/references/queries.md`.

## Rules

1. **Edge items only** — not `mastered`.
2. **5 formats, mixed.**
3. **1-line note per question.**
4. **Production graded generously** — any natural sentence counts.
5. **Cap at 8 items.**
