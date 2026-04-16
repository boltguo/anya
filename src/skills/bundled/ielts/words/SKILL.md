---
name: words
description: 'Vocabulary hub: lookup, queued-new learning, spaced review, and cross-skill transfer'
version: '5.1.0'
metadatahermes:
  tags: [ielts, vocabulary, words, lookup, srs, review, transfer]
  category: anya
---

# Words

## When to Use

- Learner says "背单词", "单词", "学单词", "复习单词", "查单词", "这个词什么意思", "words", "lookup"
- Callback: `words`, `word_review`, `word_save`, `word_known`, `word_vague`, `word_unknown`, `word_next`
- Reply Keyboard tap: "📚 单词"
- If the learner sends a single English word or a very short English phrase with little other context, treat it as **lookup mode**

## Core Model

All vocabulary lives in `vocab.db`. No JSON sidecar files.

### Vocabulary States

| Field | Meaning |
| --- | --- |
| `mastery='queued_new'` | Seeded into inventory but not formally taught yet |
| `mastery='learning'` | Introduced and now in spaced review |
| `mastery='known'` | Can be injected into speaking/writing and still reviewed |
| `mastery='mastered'` | Stable enough to leave high-frequency rotation |
| `transfer_level=0` | Only seeded, not introduced |
| `transfer_level=1` | Seen with meaning/example |
| `transfer_level=2` | Passed first active check, safe for collocation/review |
| `transfer_level=3` | Used successfully in speaking |
| `transfer_level=4` | Used successfully in writing |

### Origins

- `auto_seed`: daily silent inventory refill
- `user_lookup`: user sent the word directly
- `manual_save`: user explicitly saved a word from another skill
- `practice_injected`: promoted through practice injection
- `briefing`: extracted from daily briefing

### Stored Signals

Keep both event history and fast summary counters in `words`:

- `lookup_count`
- `review_count`
- `success_count`
- `fail_count`
- `last_result`
- `audio_path`

## Audio Contract

### Learning Audio

When generating audio for a word card, use segmented `tts` so the word is spoken 3 times, then the example sentence:

```json
[
  {"voice":"en-GB-SoniaNeural","text":"<word>"},
  {"break":"600ms"},
  {"voice":"en-GB-SoniaNeural","text":"<word>"},
  {"break":"600ms"},
  {"voice":"en-GB-SoniaNeural","text":"<word>"},
  {"break":"1200ms"},
  {"voice":"en-GB-SoniaNeural","text":"<example sentence>","rate":"-5%"}
]
```

Rules:

1. **Lookup / learn / review all send audio first when available.**
2. If `audio_path` exists, reuse it with `tg(type:"voice", url:"<audio_path>")`.
3. If `audio_path` is empty, call `tts`, capture returned `filePath`, and persist it.
4. Use simple `tts(text:"<word>")` only for fallback. Default is segmented audio.

## Mode A — Lookup

Use when the learner directly sends a word or short phrase and is clearly asking what it means.

### Detection

Treat as lookup when:

- message is 1 word, or
- 2-4 English tokens with no obvious sentence intent

### Workflow

1. Normalize lookup target to lowercase and trim punctuation.
2. Query `vocab.db`:

```
db name=vocab sql="SELECT * FROM words WHERE word = ?" params='["<word>"]'
```

3. If found:
   - reuse stored definition, translation, example, and `audio_path`
   - increment `lookup_count`
4. If not found:
   - generate:
     - English definition
     - Chinese translation
     - IPA
     - part of speech
     - 2-3 collocations
     - 1 example sentence and Chinese translation
   - generate segmented audio
   - keep it **unsaved by default**
5. Send audio first.
6. Then send the full detail card:

```text
📚 <b><word></b>  <code><ipa></code>
<b>词性</b>: <pos>
<b>英文释义</b>: <definition>
<b>中文</b>: <chinese>
<b>高频搭配</b>: <collocations>
<b>例句</b>: <example_en>
<b>翻译</b>: <example_cn>

[KEYBOARD:
💾 加入生词本=word_save | 🔁 再来一个=words
📚 开始复习=word_review | 🏠 返回=menu
]
```

7. Record lookup:

```
db name=vocab sql="INSERT INTO word_events (word, event_type, session_type, context, created_at) VALUES (?, 'lookup', 'words', ?, datetime('now'))" params='["<word>", "direct lookup"]'
```

8. Save behavior:
   - lookup does **not** auto-save
   - when `word_save` is tapped:
     - if word already exists: promote it to user-owned
     - if word does not exist yet: insert full record

### Save / Notebook Rules

When saving from lookup:

```
db name=vocab sql="INSERT INTO words (word, definition, chinese, ipa, pos, collocations, topics, source, origin, example_en, example_cn, audio_path, mastery, transfer_level, is_user_word, priority, lookup_count, review_count, success_count, fail_count, last_result, introduced_at, last_seen_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'words', 'user_lookup', ?, ?, ?, 'learning', 1, 1, 80, 1, 0, 0, 0, 'lookup_saved', datetime('now'), datetime('now'), datetime('now'), datetime('now')) ON CONFLICT(word) DO UPDATE SET is_user_word=1, priority=MAX(priority,80), origin='user_lookup', lookup_count=lookup_count+1, last_result='lookup_saved', updated_at=datetime('now')"
```

After save:

- send short confirmation: `已加入生词本`
- keep the word eligible for review

## Mode B — Learn

Use when the learner says "背单词" or enters the words skill from the main menu.

### Workflow

1. Read `MEMORY.md` for level and weak areas.
2. Prefer this queue order:
   - due review word
   - otherwise one `queued_new` word
3. Before selecting a new word, ensure inventory is healthy:

```
db name=vocab sql="SELECT COUNT(*) AS queued_new_count FROM words WHERE mastery = 'queued_new'"
```

4. If `queued_new_count < 5`, batch-generate 5 words first.
5. Show only one card at a time.

### New Word Card

For `mastery='queued_new'`, send audio first, then:

```text
📚 <b><word></b>  <code><ipa></code>

<tg-spoiler>
<pos>. <chinese>
<definition>
<example_en>
<example_cn>
</tg-spoiler>

[KEYBOARD:
✅ 认识=word_known | 🤔 模糊=word_vague | ❌ 不认识=word_unknown
💾 加入生词本=word_save | 🔄 下一个=word_next
]
```

### First Response Handling

- `word_known`
  - learner basically knows the meaning
  - update:
    - `mastery='learning'`
    - `transfer_level=max(transfer_level,2)`
    - `introduced_at=datetime('now')` if null
    - `srs_interval=1`
    - `srs_due=datetime('now','+1 day')`
    - `review_count=review_count+1`
    - `success_count=success_count+1`
    - `last_result='known'`
  - then do one collocation or meaning check

- `word_vague`
  - learner has partial familiarity
  - reveal meaning, replay audio, give one quick usage note
  - update:
    - `mastery='learning'`
    - `transfer_level=max(transfer_level,1)`
    - `introduced_at=datetime('now')` if null
    - `srs_interval=0`
    - `srs_due=datetime('now','+8 hours')`
    - `review_count=review_count+1`
    - `fail_count=fail_count+1`
    - `last_result='vague'`
  - then do one collocation or meaning check

- `word_unknown`
  - do short teaching:
    - root or synonym
    - one usage warning
    - replay slower audio
  - update:
    - `mastery='learning'`
    - `transfer_level=1`
    - `introduced_at=datetime('now')` if null
    - `srs_interval=0`
    - `srs_due=datetime('now','+2 hours')`
    - `review_count=review_count+1`
    - `fail_count=fail_count+1`
    - `last_result='unknown'`
  - then do one collocation or meaning check

- `word_next`
  - skip without promotion
  - record `event_type='skip'`

### Mandatory Follow-up Check

Newly introduced words must get one small active check. Use one of:

- meaning quiz
- collocation fill-in
- choose-the-best-sentence

Example:

```
tg(type:"quiz", text:"___ consequence", options:"[\"inevitable\",\"unavoidable\",\"certain\",\"absolute\"]", correct:0)
```

### Event Logging

Always write the event after learner interaction:

```
db name=vocab sql="INSERT INTO word_events (word, event_type, session_type, context, created_at) VALUES (?, ?, 'words', ?, datetime('now'))" params='["<word>", "<known|vague|unknown|quiz_correct|quiz_wrong|skip>", "..."]'
```

## Mode C — Review

Use when the learner taps `word_review` or a review word is selected first in Learn mode.

### Pull Rule

Only already introduced words are eligible:

```
db name=vocab sql="SELECT word, chinese, ipa, pos, example_en, example_cn, audio_path, transfer_level, srs_interval, srs_ease, review_count, success_count, fail_count FROM words WHERE mastery IN ('learning','known') AND srs_due IS NOT NULL AND srs_due <= datetime('now') ORDER BY is_user_word DESC, priority DESC, srs_due ASC LIMIT 5"
```

Never generate a brand-new word here.

### Review Card

Send audio first, then a lighter card:

```text
📝 <b><word></b>  <code><ipa></code>
<b>词性</b>: <pos>
<tg-spoiler><chinese> | <definition></tg-spoiler>
<b>例句</b>: <example_en>

[KEYBOARD:
✅ 会了=word_known | 🤔 不稳=word_vague | ❌ 忘了=word_unknown
🔄 下一个=word_next | 🏠 返回=menu
]
```

### Review Update Rules

- `word_known`
  - `review_count + 1`
  - `success_count + 1`
  - `last_result='review_pass'`
  - `srs_interval = CASE WHEN srs_interval < 1 THEN 1 ELSE srs_interval * 2 END`
  - `srs_due = datetime('now', '+' || srs_interval || ' days')`
  - if stable enough, allow `mastery='known'`

- `word_vague`
  - `review_count + 1`
  - `fail_count + 1`
  - `last_result='review_soft_fail'`
  - `srs_due=datetime('now','+12 hours')`
  - keep `mastery='learning'`

- `word_unknown`
  - `review_count + 1`
  - `fail_count + 1`
  - `last_result='review_fail'`
  - `srs_interval=0`
  - `srs_due=datetime('now','+4 hours')`
  - keep `mastery='learning'`
  - replay full detail and example

- `word_next`
  - no promotion
  - `last_result='review_skip'`

### Richer Telegram Interaction

Prefer Telegram-native interaction instead of long text explanation:

- `tg(type:"quiz")` for meaning/collocation
- spoiler for answer reveal
- inline keyboard for self-rating
- short follow-up message rather than long paragraph correction

## Cross-Skill Transfer

Other practice skills should only inject already learned words:

```
db name=vocab sql="SELECT word, definition FROM words WHERE topics LIKE ? AND mastery IN ('learning','known') AND transfer_level >= 2 ORDER BY is_user_word DESC, priority DESC, srs_due ASC LIMIT 2" params='["%<topic>%"]'
```

When used successfully:

```sql
-- speaking success
UPDATE words
SET transfer_level = CASE WHEN transfer_level < 3 THEN 3 ELSE transfer_level END,
    mastery = 'known',
    success_count = success_count + 1,
    last_result = 'speaking_transfer',
    last_seen_at = datetime('now'),
    updated_at = datetime('now')
WHERE word = ?;

-- writing success
UPDATE words
SET transfer_level = CASE WHEN transfer_level < 4 THEN 4 ELSE transfer_level END,
    mastery = 'mastered',
    success_count = success_count + 1,
    last_result = 'writing_transfer',
    last_seen_at = datetime('now'),
    updated_at = datetime('now')
WHERE word = ?;
```

## Rules

1. **DB is the only source of truth.**
2. **Inventory is filled in batches, not one word at a time.**
3. **Lookup returns voice first, then full detail card.**
4. **Direct English-word input defaults to lookup mode.**
5. **`word_save` means "加入生词本"**, not just temporary bookmarking.
6. **Review mode never introduces unseen words.**
7. **Injected practice words must be reviewable words**, not `queued_new`.
8. **Cache and reuse audio** through `audio_path`.
9. **Always write both summary counters and `word_events`** after interaction.
