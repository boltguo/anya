---
name: cron-word-seed
description: 'Silent vocabulary inventory refill: keep queued_new words ready for future learning sessions'
version: '1.0.0'
tags: [ielts, vocabulary, seed, cron, silent]
category: anya
---

# Word Inventory Seed

## When to Use

- **Cron trigger only**
- Silent maintenance job

## Purpose

Keep a ready-to-learn inventory in `vocab.db` so the learner never hits an empty word queue.

## Workflow

1. Read `MEMORY.md` for CEFR / band level and `USER.md` for interests.
2. Count current queued inventory:

```
db name=vocab sql="SELECT COUNT(*) AS queued_new_count FROM words WHERE mastery = 'queued_new'"
```

3. If `queued_new_count >= 8`:
   - return `[SILENT]`
4. Otherwise generate enough words to reach 10, capped at 5 new words per run.
5. For each generated word:
   - ensure it does not already exist in `vocab.db`
   - generate:
     - definition
     - Chinese translation
     - IPA
     - POS
     - collocations
     - topics
     - example sentence
     - example translation
   - generate pronunciation audio with segmented `tts`
   - store:
     - `origin='auto_seed'`
     - `mastery='queued_new'`
     - `transfer_level=0`
     - `audio_path`
6. Insert into `vocab.db`.
7. Return `[SILENT]`.

## Rules

1. **Silent job only.** No Telegram output.
2. **Seed in batches.** Never add just one word unless only one slot is missing.
3. **Respect learner level and interests.**
4. **Do not seed duplicates.**
5. **Generate and store audio at seed time** to reduce later lookup/review latency.
