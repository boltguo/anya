---
name: vocab-review
description: "SRS-based spaced review across words / chunks / patterns / paraphrase groups."
---

# Vocab Review

Spaced review across all `item_kind`s. Card format is kind-specific; scheduling is unified.

## When to Use

- `复习单词 / 过单词 / srs / vocab review`
- Callback `vocab-review`
- `ielts-cron-word-review` routes a daily batch

## Workflow

1. Pull 6-10 due items (`mastery IN ('learning','known') AND srs_due ≤ now`), plus 1-2 due paraphrase_groups.
2. Per card, send kind-specific format (templates in `references/cards.md`):
   - **Word** — voice + card with `<tg-spoiler>` meaning + 3-button rating
   - **Chunk** — frame + slot + 2 examples + 3-button rating
   - **Pattern** — usage + examples + optional production check
   - **Paraphrase group** — members table + 1 fill-in-blank quiz
   - **Personal error** — wrong vs correct + quick 2-option quiz
3. Apply SRS update per rating:
   - `word_known` → interval × 2.5, `success_count++`; promote `learning → known` after 3 passes, `known → mastered` after 5 more.
   - `word_vague` → interval × 1.2.
   - `word_unknown` → reset interval to 1-2 days, `fail_count++`; may demote `known → learning`.
4. Write `word_events` + counter update.
5. Session wrap: totals + next-due.

## Persist

**Follow `support/ielts-data-contract/references/post-practice-protocol.md` for all writes.** Do NOT update MEMORY.md — cron handles that via `learner-state`.

See `support/ielts-data-contract/references/queries.md` for the update SQL.

## Rules

1. **Voice first** when `audio_path` exists.
2. **3-button rating** is the SRS input.
3. **Kind-specific card** — don't force a word card on a chunk.
4. **Promote / demote on thresholds**, not single reviews.
5. **Cap batch at 10.**
6. **Never introduce a new word here** — seeds come from `vocab-contextual` / `ielts-cron-word-seed`.
7. **Write `word_events` every time.**
