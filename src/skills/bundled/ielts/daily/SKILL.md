---
name: daily
description: "Daily warm-up: news snippet, vocab recap, targeted drill"
version: "1.0.0"
metadatahermes:
  tags: [ielts, daily, briefing, cron]
  category: anya
---

# Daily Briefing

## When to Use

- Triggered by cron at **08:30 every day**
- Never triggered manually

## Resources

- **Briefing formats**: `./daily/templates/briefing_formats.md`

## Protocol

1. **Gather context**: read plan (`tracker_db.py get-plan`), MEMORY (focus + errors), USER.md (hobbies)
2. **Pick format**: rotate through A/B/C/D (see templates). Align with plan focus.
3. **Send** the micro-lesson
4. **Record** learner's response (if any) via `data` with `--skill-type daily`
5. **Add new words** (if any) via `data`

## Rules

1. **Under 3 minutes.** Warm-up, not a full session.
2. **Rotate formats.** Never repeat the same format on consecutive days.
3. **Align with the plan.** If plan says "grammar:sv_agreement", use Format B.
4. **Personalize topics** from USER.md hobbies.
5. **If absent 3+ days**: gentle re-entry, no guilt-tripping.
