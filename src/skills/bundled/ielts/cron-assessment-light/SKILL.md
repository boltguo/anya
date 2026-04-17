---
name: cron-assessment-light
description: 'Daily 22:00 silent assessment — updates MEMORY bands/errors/streak without messaging learner'
---

# Light Assessment Push (Silent)

## When to Use

- **Cron trigger only** (daily 22:00)
- Never invoked by learner callback — on-demand eval uses the `assessment` skill directly

## Workflow

Delegate to the `assessment` skill in **Light** mode. See [assessment/SKILL.md](../assessment/SKILL.md) §Protocol → "Light Evaluation (Daily 22:00)" for the full derivation.

1. Run the Light evaluation protocol:
   - Query today's samples
   - If no samples → update `streak_days` to 0 and stop (do NOT message)
   - Otherwise compute EMA bands, top 3 errors, weak dimensions, today's subcap averages
   - Update MEMORY fields: `IELTS Bands`, `Top Errors`, `Weak Dimensions`, `Study Consistency`, `Daily Load.consumed`

2. Return `[SILENT]`. This cron never sends a Telegram message.

## Rules

1. **Silent always.** No Telegram output, no pin, no react.
2. **Idempotent.** Running twice on the same day must not double-count.
3. **Skip gracefully** if no samples exist for today.
4. **All computation goes through `assessment`** — this skill is only a cron entry point.
