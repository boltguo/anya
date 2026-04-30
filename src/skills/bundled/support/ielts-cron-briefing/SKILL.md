---
name: ielts-cron-briefing
description: "Scheduled task (cron job). Runs every morning. Sources an authentic article based on user interests, generates audio, and delivers it to the user while silently seeding new vocabulary into the database."
---

# Daily Material & Silent Seeding (Morning Push)

## 1. When to Use
- Scheduled trigger: Runs automatically every morning via `cron/jobs.ts`.

## 2. Workflow (Step-by-Step)
**Step 1: Source & Generate the Material**
- Query `USER.md` for the user's interests.
- Use `web_search` to find a fresh, high-quality, authentic piece of news or a trending topic related to those interests.
- Generate an engaging, level-appropriate English article (150-250 words) based on the search. Make it slightly challenging (Band 6.5-7.5 vocabulary) to encourage learning. Include a short Chinese translation or summary at the bottom.

**Step 2: Generate Audio**
- Use the `tts` tool to generate the spoken audio of the English article. (Use normal speed, e.g., `en-US-AriaNeural`).
- Save the returned `audio_path`.

**Step 3: Silent Vocabulary Seeding (MANDATORY BACKEND ACTION)**
- Scan the sourced text. Identify **3 to 5** high-value, native phrases, idioms, or academic words that the user likely doesn't know.
- **Deduplication Check**: Query the `words` table in `study.db` to ensure these words don't already exist.
- **Silent Insert**: Use the `db` tool to INSERT the new words into the `words` table.
  - Set `mastery="queued_new"`, `origin="daily_spark"`, `srs_due=CURRENT_TIMESTAMP`.
  - Include a concise Chinese definition and the EXACT sentence from the morning article as the `example_en`.
- **CRITICAL RULE**: Do NOT tell the user you did this. This must be completely invisible to them.

**Step 4: Final Delivery (JSON Payload)**
- Because this is a cron job, you CANNOT use the `tg` tool directly.
- Instead, you MUST output a raw JSON code block containing the text, the audio path, and a pin instruction. The scheduler will parse this JSON and deliver the message and voice note automatically.
- Format the Chinese translation using an expandable blockquote (`<blockquote expandable>...</blockquote>`) so it doesn't clutter the chat unless tapped.

Output EXACTLY this format and nothing else at the end:
```json
{
  "text": "**[Title of the Article]**\n\n[English Article]\n\n<blockquote expandable>\n**中文摘要与词汇**\n[Chinese Summary/Vocab Gloss]\n</blockquote>",
  "audio_path": "[Insert the path returned by the tts tool]",
  "pin": true
}
```

## 3. Persist (Data Contract)
- **Table `words`**: MUST insert the 3-5 new words silently. Ensure no duplicates.

## 4. Hard Rules
1. **Absolute Silence on Vocab**: NEVER write "I added some words to your list" in the message sent to the user. The vocabulary extraction must be a background process only.
2. **JSON Delivery ONLY**: The final output of this skill MUST be the JSON block. Do not use the `tg` tool to send messages, keyboards, or voice notes. Do not include interactive buttons like `[📖 读读这篇新闻]`.
3. **Pin the Message**: Always set `"pin": true` in the JSON so the daily briefing stays at the top of the user's chat.
