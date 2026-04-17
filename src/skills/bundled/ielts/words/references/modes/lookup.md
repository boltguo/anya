# Mode A — Lookup

Use when the learner directly sends a word or short phrase and is clearly asking what it means.

## Detection

Treat as lookup when:

- message is 1 word, or
- 2-4 English tokens with no obvious sentence intent

## Workflow

1. Normalize lookup target to lowercase and trim punctuation.
2. Query `vocab.db`:

```
db name=vocab sql="SELECT * FROM words WHERE word = ?" params='["<word>"]'
```

3. **If found**:
   - reuse stored definition, translation, example, and `audio_path`
   - increment `lookup_count`
4. **If not found**, generate:
   - English definition
   - Chinese translation
   - IPA
   - part of speech
   - 2-3 collocations
   - 1 example sentence + Chinese translation
   - segmented audio (see `references/audio.md`)
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
     - if word does not exist yet: insert full record (see SQL below)

## Save / Notebook Rules

When saving from lookup:

```
db name=vocab sql="INSERT INTO words (word, definition, chinese, ipa, pos, collocations, topics, source, origin, example_en, example_cn, audio_path, mastery, transfer_level, is_user_word, priority, lookup_count, review_count, success_count, fail_count, last_result, introduced_at, last_seen_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'words', 'user_lookup', ?, ?, ?, 'learning', 1, 1, 80, 1, 0, 0, 0, 'lookup_saved', datetime('now'), datetime('now'), datetime('now'), datetime('now')) ON CONFLICT(word) DO UPDATE SET is_user_word=1, priority=MAX(priority,80), origin='user_lookup', lookup_count=lookup_count+1, last_result='lookup_saved', updated_at=datetime('now')"
```

After save:

- send short confirmation: `已加入生词本`
- keep the word eligible for review
