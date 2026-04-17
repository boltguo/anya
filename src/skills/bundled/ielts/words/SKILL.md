---
name: words
description: 'Vocabulary hub: lookup, queued-new learning, spaced review, and cross-skill transfer'
---

# Words

## When to Use

- Learner says "背单词", "单词", "学单词", "复习单词", "查单词", "这个词什么意思", "words", "lookup"
- Callback: `words`, `word_review`, `word_save`, `word_known`, `word_vague`, `word_unknown`, `word_next`
- Reply Keyboard tap: "📚 单词"
- If the learner sends a single English word or a very short English phrase with little other context, treat it as **lookup mode**

## Data

All vocabulary lives in `vocab.db`. No JSON sidecar files.

Useful queries:

```
# Look up a word
db name=vocab sql="SELECT * FROM words WHERE word = ?" params='["<word>"]'

# Get due review words
db name=vocab sql="SELECT word, chinese, ipa, pos, example_en, audio_path, transfer_level FROM words WHERE mastery IN ('learning','known') AND srs_due IS NOT NULL AND srs_due <= datetime('now') ORDER BY is_user_word DESC, priority DESC, srs_due ASC LIMIT 5"

# Count seeded inventory
db name=vocab sql="SELECT COUNT(*) AS queued_new_count FROM words WHERE mastery = 'queued_new'"

# Get next queued_new word
db name=vocab sql="SELECT word, chinese, ipa, pos, example_en, audio_path FROM words WHERE mastery = 'queued_new' ORDER BY priority DESC, created_at ASC LIMIT 1"
```

If a column is unfamiliar, call `db name=vocab` (no sql) for a full schema dump.

## Vocabulary State Model

| Field                    | Meaning                                                           |
| ------------------------ | ----------------------------------------------------------------- |
| `mastery='queued_new'`   | Seeded into inventory but not formally taught yet                 |
| `mastery='learning'`     | Introduced and now in spaced review                               |
| `mastery='known'`        | Can be injected into speaking/writing and still reviewed          |
| `mastery='mastered'`     | Stable enough to leave high-frequency rotation                    |
| `transfer_level=0..4`    | 0 seeded → 1 seen → 2 active-check pass → 3 spoke → 4 wrote       |

Origins: `auto_seed` / `user_lookup` / `manual_save` / `practice_injected` / `briefing`.

Stored signals (kept on every word for fast queries): `lookup_count`, `review_count`, `success_count`, `fail_count`, `last_result`, `audio_path`.

## Mode Matrix → Reference Files

| Mode       | Trigger                                            | Reference                          |
| ---------- | -------------------------------------------------- | ---------------------------------- |
| **Lookup** | Bare English word/phrase OR `这个词什么意思`        | `references/modes/lookup.md`       |
| **Learn**  | "背单词" / `words` callback / from main menu        | `references/modes/learn.md`        |
| **Review** | `word_review` callback / due word in Learn         | `references/modes/review.md`       |

Auxiliary references:

- `references/audio.md` — segmented TTS contract for word cards
- `references/transfer.md` — cross-skill injection + promotion rules

Load before executing:

```
skill_view name=words file=references/modes/<mode>.md
```

## Telegram Interaction Style

- **Voice first.** Lookup, learn, and review all send segmented audio (3× word + example) before any text card.
- **Reuse cached audio** via `audio_path` to avoid re-synthesis.
- **Inline Keyboard** for the 3-button self-rating (`word_known` / `word_vague` / `word_unknown`) — fastest UX.
- **`<tg-spoiler>`** to hide meaning/translation behind a tap, so the learner self-tests first.
- **`tg(type:"quiz")`** for the mandatory follow-up check after a new word (meaning / collocation / sentence).
- **Short confirmation** for save (`已加入生词本`) — don't repeat the full card.
- **`react`** for lightweight ack on a `word_known` review pass instead of full text.

## Rules

1. **DB is the only source of truth.**
2. **Inventory is filled in batches**, not one word at a time.
3. **Lookup returns voice first, then full detail card.**
4. **Direct English-word input defaults to lookup mode.**
5. **`word_save` means "加入生词本"**, not just temporary bookmarking.
6. **Review mode never introduces unseen words.**
7. **Injected practice words must be reviewable words**, not `queued_new`.
8. **Cache and reuse audio** through `audio_path`.
9. **Always write both summary counters and `word_events`** after interaction.
