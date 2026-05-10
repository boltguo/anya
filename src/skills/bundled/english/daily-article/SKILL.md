---
name: daily-article
description: "Daily authentic article reading. Trigger for '今日阅读', '每日文章', 'daily article'."
---

# Daily Authentic Article & Silent Seeding

## 1. When to Use
- User phrases: "今日阅读", "每日文章", "daily article"
- Callback/System triggers: `daily-article`

## 2. Adaptive Scaling
Read the user's interests from `USER.md` and their level from `MEMORY.md`.
- **Beginner (< 5.0)**: 60-100 words, simple sentence structures.
- **Intermediate (5.0-6.0)**: 100-150 words, some complex clauses.
- **Advanced (6.5+)**: 150-250 words, rich academic or native phrasing.

## 3. Workflow (State Machine - STRICT EXECUTION)

### State 0: Search
1. **Search**: Call the `web_search` tool to find a fresh, high-quality, authentic piece of news or a trending topic related to the user's interests from `USER.md`.

### State A: Generate & Seed Vocabulary
1. **Generate Article**: Write an engaging English article based on the search results, adapting to the user's level.
2. **Silent Vocabulary Seeding (MANDATORY BACKEND ACTION)**: 
   - Scan your article. Identify **3 to 5** high-value, native phrases, idioms, or academic words that the user likely doesn't know.
   - Use `persist action="word_lookup"` if you need a duplicate check.
   - Use `persist action="word_upsert"` to save new words/chunks/patterns.
     - Set `mastery="queued_new"`, `origin="daily_article"`, `srs_due=CURRENT_TIMESTAMP`.
     - Include a concise Chinese definition and the EXACT sentence from the article as the `example_en`.
   - **CRITICAL RULE**: This must be completely invisible to the user. Do NOT tell them you added words.

### State B: Audio Delivery & Presentation
Once the article is written and words are seeded, deliver the payload:
1. **Generate Audio**: Use the `tts` tool to generate the spoken audio of the English article. Choose a high-quality podcast-style voice (e.g., `en-US-AriaNeural` or `en-GB-RyanNeural`).
2. **Execute Parallel UI Actions**: You MUST invoke the `tg_msg` tool multiple times concurrently (in the same turn) to send the audio and the text separately.
   - **Action 1 (Voice)**: `tg_msg(type="voice")` to send the generated audio file.
   - **Action 2 (Text)**: `tg_msg(type="text")` to send the article text.
     - **Text**: Send the English article. Below it, include a short Chinese translation/summary wrapped in `<blockquote expandable>...</blockquote>` so it stays collapsed by default. Highlight the 3-5 words you seeded in **bold**.
     - **No buttons.** The skill ends here — the article is the payload.
3. **CRITICAL STOP**: End your turn. The skill is complete.

## 4. Hard Rules
1. **Absolute Silence on Vocab**: NEVER write "I added some words to your list" in the message sent to the user.
2. **No Conversational TTS**: The `tts` tool is ONLY for reading the article itself. Do not use TTS for conversational filler.
