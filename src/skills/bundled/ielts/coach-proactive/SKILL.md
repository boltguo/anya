---
name: coach-proactive
description: "Decide when and whether to nudge, celebrate, or refresh the plan — trigger-based."
---

# Coach Proactive

Trigger-based. Most runs produce no message — silence is valid.

## When to Use

- Manual invocation or callback `coach-proactive`
- A training skill detects a strong signal and escalates

**Not** for the learner's questions — that's `coach-passive`.

## Triggers (priority order)

`exam_close > band_drop > error_cluster > streak_break > subcap_trough > streak_milestone > band_rise > plan_refresh_due`

Full table + message templates in `references/triggers.md`.

## Workflow

1. Read MEMORY + recent subcaps + recent errors.
2. Evaluate triggers in priority order.
3. If none fire → `[SILENT]`.
4. If one fires → short message (≤ 4 sentences) + exactly one action button.
5. Record the push: `samples` row with `skill_type='coach_proactive'`, `load_score=0`.

## Rules

1. **Silence is fine.**
2. **One trigger per pass** — don't chain nags.
3. **Silence window** 23:00-07:00 local.
4. **Celebrate milestones** (7/14/30/60 days) but never guilt-trip.
5. **Record every push** so the next pass doesn't repeat.
6. **No MEMORY writes.** Plans are ephemeral text.
