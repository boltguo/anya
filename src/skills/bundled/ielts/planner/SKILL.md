---
name: planner
description: "Weekly IELTS study plan from MEMORY + learner history"
version: "1.0.0"
metadatahermes:
  tags: [ielts, planning, schedule]
  category: anya
---

# Learning Planner

## When to Use

- Triggered by `assessment` after Sunday deep evaluation
- Learner uses `/focus <area>` to manually override current focus

## Protocol

### Weekly Plan Generation (triggered by assessment)

1. Read full learner history:
   ```bash
   node ./hermes/skills/anya/data/scripts/tracker_db.js stats
   node ./hermes/skills/anya/data/scripts/tracker_db.js band-history --limit 30
   node ./hermes/skills/anya/data/scripts/tracker_db.js error-stats --limit 10
   ```

2. Read MEMORY.md for current band estimates and top errors.

3. Read USER.md for learner goals (target band, timeline).

4. Determine next week's plan:
   - **primary_focus**: The skill with the lowest band or most stagnation
   - **secondary_focus**: The skill with the most error recurrence
   - **target_skill**: Specific sub-skill to drill (e.g., "Task 2 opinion essays", "Part 2 cue cards")
   - **suggested_exercises**: 3-5 concrete exercise ideas for the week

5. Write the plan:
   ```bash
   node ./hermes/skills/anya/data/scripts/tracker_db.js add-plan \
     --week-start "2025-01-13" \
     --primary-focus "writing" \
     --secondary-focus "grammar:sv_agreement" \
     --target-skill "Task 2 opinion essays" \
     --suggested-exercises "1. Write opinion essay on education; 2. Rewrite 2 previous essays; 3. Grammar drill: subject-verb agreement"
   ```

6. Old plans are NEVER deleted — they form a historical training path.

### Manual Focus Override

When learner sends `/focus <area>`:
- Update MEMORY.md's Current Focus → Primary via `memory` tool
- Do NOT modify the plan table — the plan stays as scheduled
- This is a temporary override that the next weekly plan will reset

## Rules

1. **One plan per week.** Don't create mid-week plans.
2. **Plans are suggestions, not mandates.** The learner can practice whatever they want.
3. **Always consider the timeline.** If the test is in 2 weeks, focus on weakest high-impact areas.
4. **Balance skills.** Don't let the same skill dominate for 3+ consecutive weeks.
5. **Reference concrete exercises.** "Practice writing" is too vague. "Write a Task 2 opinion essay on environmental policy" is good.
