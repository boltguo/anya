---
name: ielts-cron-word-seed
description: "[SUPPORT] Silent vocab inventory refill (keep queued_new count ≥ 8)."
---

# Ielts Cron Word Seed

Cron-triggered maintenance. Returns `[SILENT]` when inventory is already healthy.

## When to Use

- Cron only. Not user-invocable.
- If the learner wants to learn words, use `vocab-contextual` / `vocab-topic` / `vocab-review`.

## Workflow

1. Read `MEMORY.md` (band) + `USER.md` (interests).
2. `db name=study sql="SELECT COUNT(*) AS queued_new_count FROM words WHERE mastery = 'queued_new'"` — if ≥ 8 → `[SILENT]`.
3. Generate enough new words to reach 10 (cap 5 new per run). Each must not exist already.
4. For each generated word produce: definition, Chinese, IPA, POS, collocations, topics, example (EN + CN), pronunciation audio via segmented `tts`.
5. Insert with `origin='auto_seed'`, `mastery='queued_new'`, `transfer_level=0`, `audio_path` set.
6. Return `[SILENT]`.

Seed by band range:
- `< 5.0` → basic chunks + high-frequency collocations
- `5.0-6.0` → output-oriented academic chunks
- `6.5+` → high-register replacements + nuanced hedging

## Rules

1. **Silent only** — no Telegram output.
2. **Seed in batches.**
3. **Respect level + interests.**
4. **No duplicates.**
5. **Audio at seed time** — later skills reuse `audio_path`.
