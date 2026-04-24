---
name: ielts-cron-briefing
description: "[SUPPORT] Daily 08:30 pinned learning package on Telegram."
command: false
---

# Ielts Cron Briefing

Cron-triggered. Delivers one pinned, weak-skill-aligned package per day. Scheduling is in `src/cron/default_jobs.json`.

## When to Use

- Cron triggers `08:30` (daily briefing) or `21:00` (evening check-in)
- Learner says `今天 / 今日推送 / 晨报 / daily briefing` → surface today's package

## Workflow

1. Read `MEMORY.md` (bands, weak dims, top errors), `USER.md` (interests, engage, avoid, tone). Query last 20 `samples` for freshness + avoid repetition. All queries via `ielts-data-contract`.
2. Pick today's topic — weak-skill aligned:
   - weaker writing → opinion-friendly
   - weaker speaking → personal reaction
   - weaker listening → clean audio narration
   - weaker reading → clear academic structure

   Use `web_search` for a timely article; respect `avoid` list; fall back to evergreen explainer.
3. Adapt length / sentence style / vocab load / audio speed by band range (see `references/band-ladder.md`).
4. Build package: headline + bridge (CN/EN) + adapted article + `Today's Focus` box + `Try This Next` block.
5. `image_gen` cover + `tts` narration at ladder-specified rate.
6. Send cover + article + audio + action keyboard. `tg(type:"pin")` the main entry.
7. If learner replies → record as `samples` with `skill_type='daily_briefing'`.
8. Evening check-in (21:00): query today's load + completion → short summary + tomorrow hint.

## Resources

- `templates/briefing_package.md` — full package shape
- `references/band-ladder.md` — length / style / vocab / audio speed per band

## Rules

1. **One topic per day.**
2. **Pin every main entry.**
3. **Text first, media second** — deliver even if image / audio fails.
4. **No weekly schedule** — driven by profile + weak skill + current content.
5. **Personalization > novelty.**
6. **If absent 3+ days**, lighter re-entry tone.
