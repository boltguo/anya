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
- **Table**: `samples`
- **Fields**: `skill_type="writing.essay"`, record estimated band scores if applicable.
- **Action**: Do NOT update `MEMORY.md`.

## Rules
1. **Do NOT be overly strict**: Act as a coach. Praise a good vocabulary choice before correcting errors.
2. **Explain the Why**: When correcting grammar, you MUST briefly explain the underlying rule.
3. **Progressive Hinting**: Never write the entire essay for the user unless they explicitly beg for a full sample after trying.
