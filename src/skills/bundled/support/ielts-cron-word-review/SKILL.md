---
name: ielts-cron-word-review
description: "[SUPPORT] Daily 21:00 SRS word review push."
---

# Ielts Cron Word Review

Cron-triggered. One due review card per push. Never seeds new words.

## When to Use

- Cron only. Not user-invocable.
- If the learner wants to review, use `vocab-review`.

## Workflow

1. Pull one due item:
   ```
   db name=study sql="SELECT word, definition, chinese, ipa, pos, example_en, audio_path, transfer_level FROM words WHERE mastery IN ('learning','known') AND srs_due IS NOT NULL AND srs_due <= datetime('now') ORDER BY is_user_word DESC, priority DESC, srs_due ASC LIMIT 1"
   ```
2. If empty → `[SILENT]`.
3. If `audio_path` → `tg(type:"voice", url:"<audio_path>")`.
4. Send one compact quiz:
   ```
   tg(type:"quiz",
      text:"📝 <word>  /<ipa>/\n\n这个单词的意思是？",
      options:"[\"<correct>\",\"<wrong1>\",\"<wrong2>\",\"<wrong3>\"]",
      correct:<idx>,
      explanation:"✅ <word> = <definition>\n例: <example_en>")
   ```
5. Record the push:
   ```
   db name=study sql="INSERT INTO word_events (word, event_type, session_type, context, created_at) VALUES (?, 'review_push', 'ielts-cron-word-review', ?, datetime('now'))" params='["<word>", "daily push"]'
   db name=study sql="UPDATE words SET review_count = review_count + 1, last_result = 'review_push', last_seen_at=datetime('now'), updated_at=datetime('now') WHERE word=?" params='["<word>"]'
   ```

## Rules

1. **Review only** — never push fresh unseen words.
2. **One word per push.**
3. **User-owned words first** when multiple are due (`is_user_word DESC`).
4. **Empty queue → silent.**
