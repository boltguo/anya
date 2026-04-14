---
name: flashcard
description: "One word at a time: learn, reveal, respond, sync to vocab.db"
version: "3.0.0"
metadatahermes:
  tags: [ielts, vocabulary, flashcard, srs, review]
  category: anya
---

# Flashcard — 背单词

## When to Use

- Learner says "背单词", "单词", "学单词", "复习单词", "flashcard"
- Callback: `ck:flashcard`
- Reply Keyboard tap: "📚 单词"

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
  "collocations": "meticulous planning; meticulous attention to detail",
  "topics": "academic,work",
  "example_en": "She is meticulous about keeping accurate records.",
  "example_cn": "她对保持准确的记录一丝不苟。",
  "source": "flashcard",
  "response": null,
  "created_at": "2026-04-13T18:17:40+08:00",
  "synced": false
}
```

Template: `./hermes/skills/anya/flashcard/templates/word_template.json`

### [ ] Step 4 — Generate TTS

Use Hermes `tts` tool to generate pronunciation audio.
**Read the word 3 times** with a short pause between each:

```
meticulous ... meticulous ... meticulous
```

Save audio file for sending.

### [ ] Step 5 — Send Word Card

Send the word to the learner. The word is visible, but the meaning is hidden behind a spoiler (`||text||`):

```text
📚 **meticulous**  /məˈtɪkjʊləs/

||adj. 一丝不苟的，细致的
She is meticulous about keeping accurate records.
她对保持准确的记录一丝不苟。||

[KEYBOARD:
✅ 认识=ck:word:known | 🤔 模糊=ck:word:vague | ❌ 不认识=ck:word:unknown
🔄 再来一个=ck:word:next
]
```

Also send the TTS audio as a voice message via native adapter.

The learner sees:
- The word + IPA (visible)
- Meaning area blurred (tap to reveal)
- Audio plays the pronunciation (3 times)
- First row: 3 response buttons
- Second row: "再来一个"
- 3 buttons at the bottom

### [ ] Step 6 — Collect Response

When the learner taps a button:

| Button | Action |
|---|---|
| ✅ 认识 (`ck:word:known`) | `response: "known"` → quiz: correct → sync → done |
| 🤔 模糊 (`ck:word:vague`) | `response: "vague"` → quiz: partial → sync → show full meaning |
| ❌ 不认识 (`ck:word:unknown`) | `response: "unknown"` → quiz: wrong → sync → show full meaning + encouragement |
| 🔄 再来一个 (`ck:word:next`) | Skip this word (no sync) → immediately start Step 1 for a new word |

### [ ] Step 7 — Sync to DB

After collecting response, sync the word to vocab.db:

```bash
node ./hermes/skills/anya/flashcard/scripts/sync_word.js \
  ~/.anya/data/ielts/words/<word>.json --response <known|unknown>
```

The script:
1. Adds the word to vocab.db (if not already there)
2. Records the initial quiz result (known → correct, unknown → wrong)
3. Marks the JSON file `"synced": true`

If "再来一个" was tapped, go back to Step 1.

## Scripts

| Script | Purpose |
|---|---|
| `data/scripts/vocab_db.py lookup` | Check if word exists in DB |
| `flashcard/scripts/sync_word.py` | Sync single word JSON → vocab.db |

## Rules

1. **One word at a time.** Never batch. The learner controls the pace via "再来一个".
2. **Word must not exist in DB.** Always verify with `vocab_db.py lookup` before presenting.
3. **Spoiler for meaning.** Use `||text||` so the learner can self-test before revealing.
4. **TTS reads 3 times.** Spaced repetition in audio form.
5. **JSON first, DB later.** Write word JSON immediately, sync to DB only after response.
6. **File = word name.** `~/.anya/data/ielts/words/meticulous.json` — simple, findable, no timestamps.
7. **No text reply alongside the card.** The word card IS the reply. Avoid race conditions.
