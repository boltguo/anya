---
name: writing-task2
description: "Task 2 essay drill (opinion / discussion / problem-solution / adv-disadv / two-part)."
---

# Writing Task 2

40-min drill. Task 2 weighs 2× Task 1, and argument depth is where mid-band learners lose the most marks.

## When to Use

- `Task 2 / 议论文 / essay / 观点作文 / discuss both views / problem solution`
- Callback `writing-task2`
- `writing.argument_depth` ≤ 5.5

For blank-page-freeze below 5.5 use `writing-guided`.

## Essay types

Opinion / Discussion / Problem-solution / Adv-Disadv / Two-part question. Detect type from the stem; confirm interpretation in feedback if unclear.

## Adaptive Binding

Read MEMORY and apply:

| MEMORY parameter | Controls |
|---|---|
| `IELTS Bands.Writing` | `< 5.5` → concrete/personal prompts; `5.5-6.5` → standard academic; `6.5+` → nuanced/abstract |
| `Adaptive Training Controls.writing_prompt_scope` | Override prompt abstraction if set |
| `Vocabulary Profile.cefr` | Feedback uses vocabulary at learner level; don't correct B1 word to C2 |
| `Grammar Profile.weak` | Prioritize these patterns in feedback |
| `Weak Dimensions.Writing` | Focus top-2 fixes on the weakest writing subcap |

## Workflow

1. Pick topic aligned with `Content Profile.engage`. Start clock.
2. `force_reply` ≥ 250 words.
3. Pre-checks:
   - Word count < 250 → TR cap 5.0.
   - Essay type detected.
   - Opinion type → stance clear? (miss → `task2_position_unclear`)
   - Discussion → both views + opinion? (miss → `task2_counterargument_miss`)
4. **3-layer feedback + 4-criterion scoring**:
   - **Task**: answers full prompt, position clarity, coverage.
   - **Logic**: TEEL/PEEL, argument depth (assertion + example + explanation), connector overload (> 3 / paragraph → `cohesion_overlinking`).
   - **Language**: Chinglish transfer, lexical repetition (3+ → `lexical_repetition_high`), AWL coverage (6.5+), grammar.
5. **Top 2 fixes** from different layers.
6. Micro drill (targeted) + forced rewrite of the weakest paragraph (max 2 attempts).
7. `react 🎉` on ≥ 0.5 band improvement.

## Persist

**Follow `support/ielts-data-contract/references/post-practice-protocol.md` for all writes.** Do NOT update MEMORY.md — cron handles that via `learner-state`.

- 1 `samples` row + rewrites (`parent_sample_id`, same `prompt_hash`).
- `feedback={word_count, time_sec, essay_type, position_clear, counter_arg_present, awl_rate}`.
- `subcap_scores`: all 7 writing keys, emphasising `argument_depth` + `cohesion_logic`.
- `errors`: `task2_position_unclear`, `task2_counterargument_miss`, `argument_depth_weak`, `cohesion_overlinking`, `lexical_repetition_high`, `chinglish_transfer`.

Queries: `support/ielts-data-contract/references/queries.md`.

## Rules

1. **Word count < 250 → TR capped.**
2. **Detect essay type explicitly.**
3. **3-layer feedback required.**
4. **Top 2 fixes only.**
5. **Forced rewrite targets ONE paragraph.**
6. **Argument depth check mandatory for 6+.**
