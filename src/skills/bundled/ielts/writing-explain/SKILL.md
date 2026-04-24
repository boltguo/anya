---
name: writing-explain
description: "Explain why a past essay scored what it did (Task / Logic / Language layers)."
---

# Writing Explain

Read-only. Converts abstract scores into concrete sentence-level lessons.

## When to Use

- `讲解作文 / 为什么扣分 / explain writing`
- Callback `writing-explain`
- After `writing-exam` / `writing-task2` / `writing-task1-*`

## Workflow

1. Locate sample (`sample_id` from callback or most recent writing). Pull errors + subcap scores + rewrite chain.
2. Summary card: prompt + time + word count + 4D scores + rewrite-chain band delta if any.
3. **3-layer walkthrough** with cited sentences:
   - **Task** — did it answer the prompt? Position clarity, coverage.
   - **Logic** — weakest paragraph + root + fix.
   - **Language** — top 2 recurrence keys with original → corrected.
4. **Top 2 leverage points** (`issue → expected band gain`).
5. Pattern warning if same key appeared ≥ 2 in essay OR ≥ 4 across 7d.
6. Single next-action button:

| Top issue | Callback |
| --------- | -------- |
| `argument_depth_weak` | `writing-task2` |
| `chinglish_transfer` / `lexical_repetition_high` | `writing-collocation` |
| `cohesion_overlinking` / paragraph coherence | `writing-rewrite` |
| `clause_structure` / `parallel_structure` | `writing-sentence-drill` |
| `task1_overview_missing` | `writing-task1-academic` |
| `task2_counterargument_miss` | `writing-task2` |

Queries: `support/ielts-data-contract/references/queries.md`.

## Rules

1. **Top 2 leverage points only.**
2. **Every point cites a sentence.**
3. **3-layer structure preserved.**
4. **Rewrite chain shown if present.**
5. **Pattern warning loud** when applicable.
6. **No MEMORY writes.**
