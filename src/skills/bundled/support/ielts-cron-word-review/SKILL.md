---
name: ielts-cron-word-review
description: "[SUPPORT] Frequent SRS word review push. Delivers one word flashcard quiz without breaking the agent loop."
---

# Spaced Repetition Word Review

Cron-triggered (e.g., every 30 mins). Delivers ONE due review card per push via Telegram's native Quiz feature to "brush up" the user's memory without initiating a heavy conversation session.

## When to Use
- Cron only. Not user-invocable.

## Workflow

1. **Pull one due item**:
   Use the `db` tool:
   ```sql
   SELECT word, chinese, ipa, example_en, audio_path FROM words WHERE mastery IN ('learning','known','queued_new') AND srs_due IS NOT NULL AND srs_due <= datetime('now') ORDER BY is_user_word DESC, priority DESC, srs_due ASC LIMIT 1
   ```

2. **Check Availability**:
   - If the query returns empty (no words due), you MUST exit gracefully and output: `No words due for review.`

3. **Generate Distractors (Wrong Answers)**:
   - Based on the correct `chinese` meaning of the word, creatively generate 3 plausible but incorrect Chinese meanings (distractors) that might confuse the user.
   - For example, if the word is "benevolent" (无敌的，仁慈的), distractors could be "暴虐的", "贫穷的", "脆弱的".

4. **Record the push**:
   Use the `db` tool to log that we showed this word to the user:
   ```sql
   UPDATE words SET review_count = review_count + 1, last_result = 'review_push', last_seen_at=datetime('now'), updated_at=datetime('now') WHERE word='<the_word>'
   ```

5. **Final Delivery (JSON Payload)**:
   - Because this is a cron job, you CANNOT use the `tg` tool directly.
   - You MUST output a raw JSON code block representing a Telegram Quiz. 
   - The scheduler will parse this JSON and send the native Quiz to the user.

Output EXACTLY this format and nothing else at the end:
```json
{
  "type": "quiz",
  "text": "📝 [Word] /[IPA]/\n\n这个单词的意思是？",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "correct_index": [0, 1, 2, or 3 representing the correct option],
  "explanation": "✅ [Word] = [Correct Chinese Meaning]\n\n例句: [Example Sentence]"
}
```

## Hard Rules
1. **Review only**: Never push fresh unseen words.
2. **One word per push**: Do not send multiple quizzes.
3. **JSON Delivery ONLY**: The final output MUST be the JSON block. Do not use the `tg` tool to send messages.
