---
name: writing-sentence-drill
description: "Single grammar structure practice (conditionals, cleft, inversion, participle...)."
---

# Writing Sentence Drill

Grammar-range ceiling breaker. One structure per session, 3 reps.

## When to Use

- `句子专项 / 句型 / sentence drill / grammar range`
- Callback `writing-sentence-drill`
- `writing.grammar_accuracy ≥ 6.0` but essays lack range

## Structure library

Relative clause with reduction · Participle phrase (-ing/-ed) · Cleft sentence · Inversion · Mixed conditional · Noun phrase compression · Hedged claim · Concession + counter.

## Adaptive Binding

Read MEMORY and apply:

| MEMORY parameter | Controls |
|---|---|
| `IELTS Bands.Writing` | `< 5.5` → basic structures (relative clause, conditional); `6.0+` → advanced (inversion, cleft, participle) |
| `Grammar Profile.weak` | Prefer structures from this list |
| `Grammar Profile.unstable_under_pressure` | Target these for reinforcement |
| `Vocabulary Profile.cefr` | Scenario examples use vocabulary at this level |

## Workflow

1. Pick structure (learner or auto from recent samples where the structure is under-used).
2. Teach + 2-3 examples. Explanation in ≤ 1 line.
3. 3 production reps via `force_reply`, each with a small scenario constraint.
4. Per submission:
   - Used correctly → `react 👍` + optional one-line polish.
   - Used incorrectly → show fix, ask for one retry (max 1).
   - Not used at all → explain, ask again.
5. Wrap: ok_count / 3 + best sentence + next-structure suggestion.

## Persist

**Follow `support/ielts-data-contract/references/post-practice-protocol.md` for all writes.** Do NOT update MEMORY.md — cron handles that via `learner-state`.

- 1 `samples` row (`load_score=2`, `feedback={structure, ok_count}`).
- `subcap_scores.writing.grammar_accuracy` slightly updated.
- `errors`: `clause_structure`, `parallel_structure`, `conditional_error` per attempt.
- Auto-harvest the best sentence as an `item_kind='pattern'` entry.

Queries: `support/ielts-data-contract/references/queries.md`.

## Rules

1. **One structure per session.**
2. **3 reps target, minimum 2.**
3. **Max 1 retry per attempt.**
4. **Harvest the best sentence as a pattern.**
5. **Explanation ≤ 1 line.**
