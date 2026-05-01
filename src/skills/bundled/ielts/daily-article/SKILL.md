---
name: daily-article
description: "Daily authentic article. Sources an authentic article based on user interests, generates audio, and delivers it while silently seeding new vocabulary into the database."
---

# Daily Authentic Article & Silent Seeding

## 1. When to Use
- Manual trigger: User says "每日文章 / daily article / 今日阅读 / 来篇文章"
- Callback `daily-article`

## 2. Workflow (Step-by-Step)
**Step 1: Source & Generate the Material**
- Query `USER.md` for the user's interests and their `current_level_estimate` (or infer their level from `MEMORY.md`).
- Use `web_search` to find a fresh, high-quality, authentic piece of news or a trending topic related to those interests.
- Generate an engaging English article based on the search. 
  - **CRITICAL**: You MUST adapt the article's length and vocabulary difficulty to the user's current level.
    - **Beginner / weak**: 60-100 words, simple sentence structures (Band 4.5-5.0).
    - **Intermediate / medium**: 100-150 words, some complex clauses (Band 5.5-6.0).
    - **Advanced / fluent**: 150-250 words, rich academic or native phrasing (Band 6.5-7.5).
  - Include a short Chinese translation or summary at the bottom.

**Step 2: Generate Audio**
- Use the `tts` tool to generate the spoken audio of the English article. (Use normal speed, e.g., `en-US-AriaNeural`).
- Save the returned `audio_path`.

**Step 3: Silent Vocabulary Seeding (MANDATORY BACKEND ACTION)**
- Scan the sourced text. Identify **3 to 5** high-value, native phrases, idioms, or academic words that the user likely doesn't know.
- **Deduplication Check**: Query the `words` table in `study.db` to ensure these words don't already exist.
- **Silent Insert**: Use the `db` tool to INSERT the new words into the `words` table.
  - Set `mastery="queued_new"`, `origin="daily_article"`, `srs_due=CURRENT_TIMESTAMP`.
  - Include a concise Chinese definition and the EXACT sentence from the article as the `example_en`.
- **CRITICAL RULE**: Do NOT tell the user you did this. This must be completely invisible to them.

**Step 4: Delivery via Telegram**
- Use `tg(type:"text")` to send the article. Format the Chinese translation using an expandable blockquote (`<blockquote expandable>...</blockquote>`) so it doesn't clutter the chat unless tapped.
- Use `tg(type:"voice")` to send the audio file.

## 3. Persist (Data Contract)
- **Table `words`**: MUST insert the 3-5 new words silently. Ensure no duplicates.

## 4. Hard Rules
1. **Absolute Silence on Vocab**: NEVER write "I added some words to your list" in the message sent to the user. The vocabulary extraction must be a background process only.
2. **Direct Telegram Delivery**: Use the `tg` tool to send the article text and voice audio directly.
