---
name: reading-vocab-extract
description: "After a reading session, harvest words / chunks / paraphrase pairs into study.db."
---

# Reading Vocab Extract

Bridge between reading and vocab. Seeds the right cards for later review.

## When to Use

- `抽词 / 保存词 / 把这篇的词加进来`
- Callback `reading-vocab-extract`
- Auto after `reading-untimed` with ≥ 2 paraphrase misses OR `reading-exam` with ≥ 3 unknown-word question cluster

## Workflow

1. Locate most recent reading sample with usable passage + pull linked errors.
2. Mine candidates into 3 buckets (caps: 5 / 3 / 3):
   - **Words**: content words the learner misread or didn't know
   - **Chunks**: 2-3 word expressions reusable in writing
   - **Paraphrase pairs**: word in passage ↔ word in question stem
3. Skip anything already in `study.db`.
4. If learner triggered explicitly → show confirmation card with toggles; if auto-triggered → save directly.
5. Insert (word/chunk with `item_kind`, paraphrase_group + members). Every row must set `source_sample_id`.
6. Short confirm + `[🔄 vocab-review]  [📚 nav:vocab]  [🏠 nav:main]`.

Queries + insert templates: `support/ielts-data-contract/references/queries.md`.

## Rules

1. **Caps are hard** (5 / 3 / 3).
2. **Skip duplicates.**
3. **`source_sample_id` always set.**
4. **Do not teach here** — that's `vocab-review` / `vocab-contextual`.
5. **`mastery='queued_new'`** unless the word was in an error correction (`'learning'`).
6. **No recent reading session → route to `reading-*`.**
