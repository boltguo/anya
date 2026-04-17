---
name: cron-assessment-deep
description: 'Sunday 20:00 weekly report — alternates Deep eval and Biweekly focused deep-dive'
---

# Weekly Assessment Push (Sunday 20:00)

## When to Use

- **Cron trigger only** (every Sunday 20:00)
- On-demand weekly eval uses the `assessment` skill directly

## Mode Selection (Deep vs Biweekly)

Alternates by ISO week parity:

```
db name=learner sql="SELECT (strftime('%W','now') * 1) % 2 AS parity"
```

- `parity = 0` → Deep Evaluation (full 7-day analysis + full report)
- `parity = 1` → Biweekly Deep Dive (14-day focused analysis on primary driver)

Alternate rule: if the last run was Deep, run Biweekly next, and vice versa. Prefer the last-run check when stage_transitions or mock_sessions suggest a recent Deep already happened today.

## Workflow

Delegate to the `assessment` skill. See [assessment/SKILL.md](../assessment/SKILL.md) §Protocol for the full derivation.

### Deep (even weeks)

1. Run the Deep Evaluation protocol (7-day rolling + subcap radar + stability metrics + root cause distribution)
2. Update ALL MEMORY fields (see assessment/SKILL.md for the full list, including `Active Driver.stability_status` and `next_micro_action`)
3. Send the weekly report (template in `assessment/SKILL.md` §Weekly Report Template)
4. `tg(type:"pin")` the report
5. Include `🎯 刷新训练计划=orchestrator:run` button so the learner can explicitly trigger orchestrator

### Biweekly (odd weeks)

1. Read MEMORY `Active Driver.primary_focus` → target skill
2. Run the Biweekly Deep Dive protocol (14-day subcap trends + 10 micro-drills on weakest subcaps)
3. Send the Biweekly focused report (template in `assessment/SKILL.md` §Biweekly Deep Dive)
4. Do NOT pin (keeps the Deep weekly pinned)
5. Include `🎯 开始专项训练={{primary_cb}}` button

## Rules

1. **One report per Sunday.** If both Deep and Biweekly conditions fire, prefer Deep.
2. **Never chain-invoke orchestrator.** The report must include the `orchestrator:run` button; the learner taps it, or the daily cron picks it up on Monday morning.
3. **Pin only Deep reports.** Biweekly reports stay unpinned.
4. **All computation goes through `assessment`** — this skill is only a cron entry point + mode picker.
5. **Idempotent.** Running twice on the same Sunday must not produce two reports; check for an existing `skill_type='weekly_report'` sample today before sending.
