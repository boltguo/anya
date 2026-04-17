---
name: words
description: 'Vocabulary hub: lookup, learning, spaced review, chunk/pattern/paraphrase support, score-aware seeding, cross-skill transfer'
---

# Words — Unified Memory System

## Pedagogical Foundation

- **Lewis Lexical Approach**: Language stored as chunks, not individual words — collocations and patterns are primary
- **FSRS SRS**: Spaced repetition covers words, chunks, patterns, paraphrase groups, and personal error expressions
- **Krashen i+1**: Vocabulary matched to learner's current level + 1
- **PRD §9.1**: SRS extends beyond vocabulary to cover all linguistic knowledge types

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

# Get due review words (all item_kinds)
db name=vocab sql="SELECT word, chinese, ipa, pos, example_en, audio_path, transfer_level, item_kind FROM words WHERE mastery IN ('learning','known') AND srs_due IS NOT NULL AND srs_due <= datetime('now') ORDER BY is_user_word DESC, priority DESC, srs_due ASC LIMIT 5"

# Count seeded inventory
db name=vocab sql="SELECT COUNT(*) AS queued_new_count FROM words WHERE mastery = 'queued_new'"

# Get next queued_new word
db name=vocab sql="SELECT word, chinese, ipa, pos, example_en, audio_path, item_kind FROM words WHERE mastery = 'queued_new' ORDER BY priority DESC, created_at ASC LIMIT 1"

# Get due review by item_kind
db name=vocab sql="SELECT word, chinese, item_kind, example_en FROM words WHERE mastery IN ('learning','known') AND srs_due <= datetime('now') AND item_kind = ? ORDER BY priority DESC LIMIT 5" params='["chunk"]'

# Get paraphrase group for review
db name=vocab sql="SELECT pg.id, pg.topic, pm.register, w.word, w.definition, w.example_en FROM paraphrase_groups pg JOIN paraphrase_members pm ON pg.id = pm.group_id JOIN words w ON pm.word_id = w.word WHERE pg.id = ? ORDER BY pm.register" params='[1]'

# Get all paraphrase groups
db name=vocab sql="SELECT pg.id, pg.topic, COUNT(pm.word_id) as member_count FROM paraphrase_groups pg LEFT JOIN paraphrase_members pm ON pg.id = pm.group_id GROUP BY pg.id ORDER BY pg.created_at DESC"
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

## Item Kinds

| Kind | Description | Card Format | Example |
|---|---|---|---|
| `word` | Single vocabulary item | Definition + IPA + example + audio | "resilient" |
| `chunk` | Multi-word expression / collocation | Frame + slot + example | "take ... into account" |
| `pattern` | Sentence frame with fillable slots | Pattern + 2-3 example fillings | "It is [adj] that [clause]" |
| `paraphrase_group` | Label for a synonym cluster | Group topic + 2-3 members with register | "important → crucial, significant, vital" |
| `personal_error` | Learner's recurring wrong expression | Wrong → Correct + context | "make damage" → "cause damage" |

Origins: `auto_seed` / `user_lookup` / `manual_save` / `practice_injected` / `briefing` / `auto_harvest`.

Stored signals: `lookup_count`, `review_count`, `success_count`, `fail_count`, `last_result`, `audio_path`.

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

## Score-Aware Vocabulary (for cron-word-seed)

The type of vocabulary seeded depends on the learner's current `IELTS Bands.Overall`:

| Overall band | Seed Priority | Examples |
|---|---|---|
| `< 5.0` | Basic chunks + high-frequency collocations | "on the other hand", "in terms of" |
| `5.0-6.0` | Output-oriented expressions + useful academic chunks | "It is widely acknowledged that...", "contribute to" |
| `6.5+` | High-register replacements + nuanced hedging | "arguably", "to a certain extent", "notwithstanding" |

Read MEMORY `IELTS Bands.Overall` to determine seed strategy.

## Learn Mode: Chunk / Pattern Cards

When `item_kind` is `chunk` or `pattern`, use a specialized card format:

### Chunk Card

```
📚 **take ... into account**
/teɪk ... ɪntuː əˈkaʊnt/

意思: 考虑到
类型: 搭配短语 (chunk)

💡 框架: take [something] into account
📝 示例:
  - "We must take **all factors** into account."
  - "Did you take **the cost** into account?"

🔊 {{audio}}

[KEYBOARD:
✅ 会了=word_known | 🤔 模糊=word_vague | ❌ 不会=word_unknown
]
```

### Pattern Card

```
📚 **It is [adj] that [clause]**
类型: 句型模板 (pattern)

💡 用法: 用于学术写作中表达观点

📝 示例:
  - "It is **evident** that education plays a key role."
  - "It is **debatable** whether technology improves learning."
  - "It is **crucial** that governments take action."

🎯 你来试: 用这个句型造一个句子

[KEYBOARD:
✅ 会用了=word_known | 🤔 还需练习=word_vague | ❌ 不会=word_unknown
]
```

## Review Mode: Paraphrase Group Review

When reviewing a `paraphrase_group`, present 2-3 members together:

```
📚 同义替换组: "重要的"

| 表达 | 语域 | 示例 |
|---|---|---|
| important | neutral | "Education is important." |
| crucial | formal | "It is crucial to address..." |
| vital | formal | "Vitamin D is vital for..." |
| significant | academic | "There was a significant increase." |

🎯 选择题: "环境保护______。" 哪个最合适？
```

Reviewing paraphrase groups trains `reading.paraphrase_mapping` and `writing.lexical_sophistication`.

## Auto-Harvest Pipeline

Training skills automatically deposit high-value expressions:

1. **Writing feedback** → Chunks and patterns used in band-7+ rewrites are harvested with `source_sample_id`
2. **Speaking feedback** → Good collocations from successful speaking practice are harvested
3. **Reading** → Attitude words from attitude-scan mode are harvested as patterns
4. **Listening** → Academic vocabulary from lecture mode is harvested

Each harvested item uses `origin='auto_harvest'` and links back to its source via `source_sample_id`.

## Telegram Interaction Style

- **Voice first.** Lookup, learn, and review all send segmented audio (3× word + example) before any text card.
- **Reuse cached audio** via `audio_path` to avoid re-synthesis.
- **Inline Keyboard** for the 3-button self-rating (`word_known` / `word_vague` / `word_unknown`) — fastest UX.
- **`<tg-spoiler>`** to hide meaning/translation behind a tap, so the learner self-tests first.
- **`tg(type:"quiz")`** for the mandatory follow-up check after a new word (meaning / collocation / sentence).
- **Short confirmation** for save (`已加入生词本`) — don't repeat the full card.
- **`react`** for lightweight ack on a `word_known` review pass instead of full text.

## Session Completion

After a learn or review session, update word counters and `word_events` only. No task scheduling is required.

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
10. **Chunk and pattern cards** use specialized formats, not the standard word card.
11. **Paraphrase groups** are reviewed as sets, showing register differences.
12. **Auto-harvested items** must have `source_sample_id` linking back to the training session.
13. **Score-aware seeding**: lower bands get high-frequency chunks first, higher bands get nuanced replacements and hedging.
