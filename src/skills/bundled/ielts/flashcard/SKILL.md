---
name: flashcard
description: 'Vocabulary: 4-level transfer model (notice → collocation → speaking → writing)'
version: '4.0.0'
metadatahermes:
  tags: [ielts, vocabulary, flashcard, srs, review, transfer]
  category: anya
---

# Flashcard — 4-Level Transfer System

## When to Use

- Learner says "背单词", "单词", "学单词", "复习单词", "flashcard"
- Callback: `ck:flashcard`, `ck:word:review`
- Reply Keyboard tap: "📚 单词"

## 4-Level Transfer Model

| Level  | Name              | Activity                                    | Tool                       |
| ------ | ----------------- | ------------------------------------------- | -------------------------- |
| **L1** | Notice            | Flashcard recognition (known/vague/unknown) | Inline keyboard            |
| **L2** | Collocation       | Collocation quiz                            | `tg(type:"quiz")`          |
| **L3** | Speaking Transfer | Force use in speaking practice              | Injected as challenge word |
| **L4** | Writing Transfer  | Force use in writing practice               | Injected as challenge word |

Words progress L1 → L2 → L3 → L4 through use across skills.

## Data Folders

```
~/.anya/data/ielts/
├── words/           ← 每个单词一个 JSON 文件（{word}.json）
├── learn/           ← 其他练习类型的会话数据
└── vocab.db         ← SRS 数据库（最终同步目标）
```

## Workflow

Agent follows this checklist step by step. **One word per round.**

### [ ] Step 1 — Analyze Level

Read MEMORY.md → get current band / CEFR level.
This determines word difficulty (A2/B1/B2/C1 range).

### [ ] Step 2 — Pick a Word

Think of a word appropriate for the learner's level and USER.md interests.
The word must NOT already be in vocab.db. Verify:

```bash
node vocab_db.js lookup <word>
```

If the word exists (returns data), pick a different word. Repeat until you find one that returns "not found".

### [ ] Step 3 — Write Word JSON

Fill in all fields from the template and save:

```bash
mkdir -p ~/.anya/data/ielts/words
```

Save to `~/.anya/data/ielts/words/{word}.json`:

```json
{
  "word": "meticulous",
  "ipa": "/məˈtɪkjʊləs/",
  "pos": "adj",
  "definition": "showing great attention to detail; very careful and precise",
  "chinese": "一丝不苟的，细致的",
  "collocations": "meticulous planning; meticulous attention to detail; meticulous about",
  "topics": "academic,work",
  "example_en": "She is meticulous about keeping accurate records.",
  "example_cn": "她对保持准确的记录一丝不苟。",
  "source": "flashcard",
  "response": null,
  "transfer_level": 1,
  "created_at": "2026-04-15T18:17:40+08:00",
  "synced": false
}
```

### [ ] Step 4 — Generate TTS

Use `tts` tool to generate pronunciation audio.
**Read the word 3 times** with a short pause between each:

```
meticulous ... meticulous ... meticulous
```

### [ ] Step 5 — Send Word Card (L1 Notice)

Send the word to the learner. Meaning hidden behind spoiler:

```text
📚 **meticulous**  /məˈtɪkjʊləs/

<tg-spoiler>adj. 一丝不苟的，细致的
She is meticulous about keeping accurate records.
她对保持准确的记录一丝不苟。</tg-spoiler>

[KEYBOARD:
✅ 认识=ck:word:known | 🤔 模糊=ck:word:vague | ❌ 不认识=ck:word:unknown
💾 加入单词本=ck:word:save | 🔄 再来一个=ck:word:next
]
```

Also send the TTS audio as a voice message.

### [ ] Step 6 — Collect Response + L2 Collocation Drill

| Button                         | Action                                                                                         |
| ------------------------------ | ---------------------------------------------------------------------------------------------- |
| ✅ 认识 (`ck:word:known`)      | → **Directly enter L2 Collocation Quiz**                                                       |
| 🤔 模糊 (`ck:word:vague`)      | → Show full meaning + TTS re-read → then **L2 Collocation Quiz**                               |
| ❌ 不认识 (`ck:word:unknown`)  | → **Deep teaching**: word root + synonyms + antonyms + TTS slow → then **L2 Collocation Quiz** |
| 💾 加入单词本 (`ck:word:save`) | → Sync to vocab.db immediately, react ✅, continue current flow                                |
| 🔄 再来一个 (`ck:word:next`)   | → Skip (no sync) → start Step 1 for new word                                                   |

**L2 Collocation Quiz** (after known/vague/unknown):

```
tg(type:"quiz", text:"___ consequence", options:["inevitable", "unavoidable", "certain", "absolute"], correct:0)
```

Record quiz result to vocab.db.

### [ ] Step 7 — Sync to DB

After collecting response + completing L2 quiz:

```bash
node vocab_db.js add --word <word> --definition "..." --chinese "..." \
  --ipa "..." --pos "..." --collocations "..." --topics "..." \
  --source "flashcard" --example "..."
node vocab_db.js quiz <word> --type collocation --result <correct|wrong|partial>
node vocab_db.js set-transfer <word> --level 2
```

If "再来一个" was tapped, go back to Step 1.

## Cross-Skill Transfer (L3/L4)

Words at L2+ are automatically injected into speaking/writing sessions:

```bash
# Speaking/Writing S2 step:
node vocab_db.js inject --transfer-level 2 --limit 2
```

When a word is successfully used in speaking:

```bash
node vocab_db.js use <word> --event production --session-type speaking --context "..."
node vocab_db.js set-transfer <word> --level 3
```

When successfully used in writing:

```bash
node vocab_db.js use <word> --event production --session-type writing --context "..."
node vocab_db.js set-transfer <word> --level 4
```

## Anytime Word Add (ck:word:save)

From any conversation context, user can save a word:

- `ck:word:save` callback → `vocab_db.js add` → react ✅
- Word is added at L1, enters SRS rotation

## SRS Review (ck:word:review)

When triggered:

1. `vocab_db.js list due --limit 5` → get due words
2. For each word, present based on transfer_level:
   - L1: Flashcard recognition (show word → known/vague/unknown)
   - L2: Collocation quiz
   - L3: "下次口语练习时必须用上这个词"
   - L4: "下次写作中将此词作为挑战词汇"

## Scripts

| Script                                  | Purpose                                   |
| --------------------------------------- | ----------------------------------------- |
| `data/scripts/vocab_db.js lookup`       | Check if word exists in DB                |
| `data/scripts/vocab_db.js add`          | Add word to vocab.db                      |
| `data/scripts/vocab_db.js quiz`         | Record quiz result                        |
| `data/scripts/vocab_db.js set-transfer` | Update transfer level                     |
| `flashcard/scripts/sync_word.js`        | Sync single word JSON → vocab.db (legacy) |

## Rules

1. **One word at a time.** Never batch. The learner controls the pace via "再来一个".
2. **Word must not exist in DB.** Always verify with `vocab_db.js lookup` before presenting.
3. **Spoiler for meaning.** Use `<tg-spoiler>` so the learner can self-test before revealing.
4. **TTS reads 3 times.** Spaced repetition in audio form.
5. **L2 Collocation Quiz is mandatory** after known/vague/unknown response.
6. **Cross-skill injection**: L2+ words are injected into speaking/writing as challenge words.
7. **No text reply alongside the card.** The word card IS the reply.
8. **Maximum 5 words per review session.**
9. **Transfer level auto-upgrades** when words are used in production contexts.
