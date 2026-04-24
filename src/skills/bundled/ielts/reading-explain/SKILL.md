---
name: reading-explain
description: "Explain reading misses with exact evidence lines + trap category."
---

# Reading Explain

Read-only. Reads one reading session and pinpoints the top 3 misses to passage lines.

## When to Use

- `讲解阅读 / 为什么这题错 / explain reading`
- Callback `reading-explain`
- After `reading-exam` / `reading-timed` / `reading-typetrain`

## Workflow

1. Locate sample (`sample_id` from callback or most recent). Pull errors + subcap scores. Load `analysis-weakness/assets/error-taxonomy.md`.
2. Top 3 misses by severity × impact.
3. Per miss: question + learner answer + correct + passage evidence (line + paragraph) + trap category (`tfng_logic_error` / `heading_mismatch` / `keyword_matching_error` / `inference_error` / `detail_location_fail`) + root cause + fix pattern. Annotate hedging words (TFNG) or paraphrase pair (Completion).
4. Pattern warning if same key ≥ 2 in session OR ≥ 4 in 7 days.
5. If session was `reading-untimed`, add paragraph-function recap.
6. One button mapped to top issue → `reading-typetrain` / `reading-untimed` / `reading-skim-drill` / `reading-vocab-extract`.

Queries: `support/ielts-data-contract/references/queries.md`.

## Rules

1. **Top 3 only.**
2. **Evidence line mandatory.**
3. **Name taxonomy key + root cause.**
4. **Pattern warning stays loud.**
5. **Don't re-grade** the session — flag, don't overwrite.
6. **No MEMORY writes.**
