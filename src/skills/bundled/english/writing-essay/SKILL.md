---
name: writing-essay
description: "Use this skill whenever the user wants to practice writing a long-form text (paragraph, essay, letter, chart description). MUST be used for any writing task exceeding one sentence."
---

# Writing Essay (Comprehensive Practice)

## When to Use
- "Write an essay" / "Write a letter" / "Task 2" / "Task 1"
- User submits a paragraph or essay for grading.
- User asks for a writing prompt.

## Workflow
1. **Prompt Selection**: If the user didn't specify, offer 3 choices (A: Practical Letter, B: Data/Chart, C: Opinion Essay).
2. **Drafting (SOS Protocol)**: If the user says "I'm stuck" or uses their native language, IMMEDIATELY provide a 3-word vocabulary bank and a sentence starter. Do NOT grade them yet.
3. **Evaluation**: Once submitted, evaluate across: Task Completion, Coherence, Vocabulary, Grammar.
4. **Native Polish**: MUST provide a rewritten, native-like version of 1-2 awkward sentences from their draft.

## Persist (Data Contract)

**Follow `support/data-contract/references/post-practice-protocol.md` for all writes.** Do NOT update MEMORY.md — `learner-state` skill handles that.

1. **`samples`** row:
   - `skill_type = 'writing.essay'`
   - `prompt` = the essay question/task
   - `raw_content` = the user's full essay text
   - `accuracy = NULL` (essays are band-scored, not accuracy-scored)
   - `band_task`, `band_coherence`, `band_lexical`, `band_grammar`, `band_overall` — all required
   - `load_score = 3`
   - `feedback` = A concise but detailed textual analysis of this specific attempt. Write about what exactly the user missed, the root cause, and overall performance. Do NOT use JSON.
     Example: "The user struggled with relative clauses and vocabulary precision, but maintained good overall flow."

2. **`errors`** — from `references/error-keys.md`:
   - `article_usage`, `verb_form_error`, `collocation_error`, `coherence_gap`, `run_on_sentence`, `task_incomplete`
   - One row per distinct error, with `original_phrase` + `correction`

3. **`subcap_scores`** — at least 2:
   - `writing.argument_depth`, `writing.cohesion`, `writing.lexical_range`, `writing.grammar_accuracy`

4. **`activity_log`** — upsert today

## Rules
1. **Do NOT be overly strict**: Act as a coach. Praise a good vocabulary choice before correcting errors.
2. **Explain the Why**: When correcting grammar, you MUST briefly explain the underlying rule.
3. **Progressive Hinting**: Never write the entire essay for the user unless they explicitly beg for a full sample after trying.
