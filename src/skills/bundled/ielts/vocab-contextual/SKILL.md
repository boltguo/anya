---
name: vocab-contextual
description: "Learn 5-8 words from recent practice with the original source sentence."
---

# Vocab Contextual

Every word is tied to a session the learner remembers. Beats rote lists.

## When to Use

- `学从我练的 / 题源抽词 / 结合上下文学`
- Callback `vocab-contextual`
- Recent sessions had clusters of unknown words (after `reading-vocab-extract` ran)

## Workflow

1. Scan last 7 days: recent `samples` with usable `raw_content` + linked `errors` (paraphrase / word_choice). Also pull `queued_new` words with `source_sample_id` in the last 14 days.
2. Keep 5-8 items.
3. Per item:
   - Show source context (the sentence from the learner's session).
   - Reveal target + `<tg-spoiler>` meaning (voice if `audio_path`).
   - Show ONE variant example in a different context.
   - Production check: `force_reply` "用 \"{{word}}\" 造一句跟原文无关的".
4. Per result:
   - Correct → bump `transfer_level` toward 4; if `queued_new` → `mastery='learning'`; `srs_due = +1d`.
   - Wrong → one fix + one retry; `srs_due = +1d`, `last_result='contextual_retry'`.
5. Wrap + `[🔁 vocab-contextual]  [🔄 vocab-review]  [🧠 vocab-testme]  [🏠 nav:main]`.

Queries: `support/ielts-data-contract/references/queries.md`.

## Rules

1. **Every item cites the learner's own session.**
2. **Production check mandatory.**
3. **Graduate `queued_new → learning`** on first successful contextual use.
4. **≤ 8 items per session.**
5. **Voice playback when available.**
6. **Always schedule follow-up review** via `srs_due`.
