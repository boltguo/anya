---
name: cron-word-review
description: 'Daily vocabulary review push: only review already introduced words from vocab.db'
version: '2.0.0'
tags: [ielts, vocabulary, review, cron, telegram]
category: anya
---

# Word Review Push

## When to Use

- **Cron trigger only**
- If the learner says "发个单词测试" or similar, use the `words` skill instead

## Workflow

1. Pull one due review word:

```
db name=vocab sql="SELECT word, definition, chinese, ipa, pos, example_en, audio_path, transfer_level FROM words WHERE mastery IN ('learning','known') AND srs_due IS NOT NULL AND srs_due <= datetime('now') ORDER BY is_user_word DESC, priority DESC, srs_due ASC LIMIT 1"
```

2. If no due review word exists:
   - return `[SILENT]`
   - do not generate a new word here
3. If `audio_path` exists, send it first with:

```
tg(type:"voice", url:"<audio_path>")
```

4. Then send one compact quiz card:

```
tg(type:"quiz",
   text:"📝 <word>  /<ipa>/\n\n这个单词的意思是？",
   options:"[\"<correct>\",\"<wrong1>\",\"<wrong2>\",\"<wrong3>\"]",
   correct:<idx>,
   explanation:"✅ <word> = <definition>\n例: <example_en>")
```

5. Record the push:

```
db name=vocab sql="INSERT INTO word_events (word, event_type, session_type, context, created_at) VALUES (?, 'review_push', 'cron-word-review', ?, datetime('now'))" params='["<word>", "daily push"]'
db name=vocab sql="UPDATE words SET review_count = review_count + 1, last_result = 'review_push', last_seen_at=datetime('now'), updated_at=datetime('now') WHERE word=?" params='["<word>"]'
```

## Rules

1. **Review only.** Never push a fresh unseen word.
2. **One word per push.**
3. **Prefer user-owned words first** when multiple words are due.
4. **If the queue is empty, stay silent.**
