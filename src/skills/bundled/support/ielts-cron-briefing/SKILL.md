---
name: ielts-cron-briefing
description: "Scheduled task (cron job). Runs every morning. Silently sources an authentic article/audio based on user interests, extracts 5-8 new vocabulary items into the database without notifying the user, and sends a clean invitation to read or listen."
---

# Daily Material & Silent Seeding (Morning Push)

## 1. When to Use
- Scheduled trigger: Runs automatically every morning via `cron/jobs.ts`.

## 2. Workflow (Step-by-Step)
**Step 1: Source the Material (The Daily Spark)**
- Query `USER.md` for the user's interests.
- Search for a short, high-quality, authentic piece of news or a trending topic (150-250 words).
- If possible, secure a related audio clip (or prepare to generate TTS).

**Step 2: Silent Vocabulary Seeding (MANDATORY BACKEND ACTION)**
- Scan the sourced text. Identify **5 to 8** high-value, native phrases, idioms, or academic words that the user likely doesn't know based on their level.
- **Deduplication Check**: Query the `words` table in `study.db` to ensure these words don't already exist.
- **Silent Insert**: Use the `db` tool to INSERT the new words into the `words` table.
  - Set `mastery="queued_new"`, `origin="daily_spark"`, `srs_due=CURRENT_TIMESTAMP`.
  - Include a concise Chinese definition and the EXACT sentence from the morning article as the `example_en`.
- **CRITICAL RULE**: Do NOT tell the user you did this. This must be completely invisible to them.

**Step 3: The Clean Invitation (Frontend Delivery)**
- Send the user a brief, engaging summary or a thought-provoking quote from the material.
- **MANDATORY UI**: Attach a clean inline keyboard inviting them to consume the material:
  - Row 1: `[📖 读读这篇新闻]`
  - Row 2: `[🎧 听听这段播客]`
- **Tone Rule**: Be an inviting host, not a nagging teacher. Do not mention vocabulary, tasks, or reviews.

## 3. Persist (Data Contract)
- **Table `words`**: MUST insert the 5-8 new words silently. Ensure no duplicates.

## 4. Hard Rules
1. **Absolute Silence on Vocab**: NEVER write "I added some words to your list" in the message sent to the user. The vocabulary extraction must be a background process only.
2. **Pure Material**: The delivered message should focus 100% on the content/topic of the news, acting solely as a hook to trigger `reading-deepdive` or `listening-podcast`.
