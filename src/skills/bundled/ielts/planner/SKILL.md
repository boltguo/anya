---
name: planner
description: 'Weekly IELTS study plan with mode recommendations, carry-over errors, difficulty notes'
version: '2.0.0'
metadatahermes:
  tags: [ielts, planning, schedule, weekly]
  category: anya
---

# Learning Planner

## When to Use

- Triggered by `assessment` after Sunday deep evaluation
- Callback: `ck:report:plan` (user requests plan)
- Learner uses `/focus <area>` to manually override current focus

## Protocol

### Weekly Plan Generation (triggered by assessment)

1. Read full learner history:

   ```bash
   node tracker_db.js stats
   node tracker_db.js band-history --limit 30
   node tracker_db.js error-stats --limit 10
   node tracker_db.js list-samples --since 7d --limit 50
   node tracker_db.js list-plans
   ```

2. Read MEMORY.md for current band estimates, top errors, weak dimensions.

3. Read USER.md for learner goals (target band, timeline, study pattern).

4. Determine next week's plan:

   **Plan Structure:**

   ```yaml
   week_label: '2026-W16'
   primary_skill: writing # Skill with lowest band or most stagnation
   primary_subskill: coherence # Specific IELTS sub-criterion to target
   secondary_skill: speaking # Second priority
   core_problem: 'cohesion_missing, topic_sentence_weak' # From error taxonomy
   training_modes:
     writing: [teel_drill, full_task] # Recommended modes for the week
     speaking: [guided_qa, examiner_sim]
     listening: [dictation] # At least 1 dictation per week
     reading: [standard]
   weekly_target:
     sessions: 5 # Based on study pattern
     writing: 2
     speaking: 2
     listening: 1
   carry_over_errors: 'sv_agreement, cohesion_missing' # Persistent errors from last week
   difficulty_notes: 'User reported too_hard on last 2 writing sessions — lower scaffolding'
   ```

5. **3-Week Rotation Rule**: Don't let the same skill dominate as primary for 3+ consecutive weeks. If writing was primary for 2 weeks, rotate even if it's still the weakest.

6. Write the plan:

   ```bash
   node tracker_db.js add-plan \
     --week-label "2026-W16" \
     --primary-focus "writing" \
     --secondary-focus "speaking" \
     --target-skill "Task 2 coherence + TEEL structure" \
     --suggested-exercises '["TEEL drill on opinion essay", "Full Task 2 with forced rewrite", "Guided QA on Part 1 expansion", "Examiner Sim Part 3", "Dictation session"]' \
     --carry-over-errors "sv_agreement,cohesion_missing" \
     --difficulty-notes "Lower writing difficulty, increase scaffolding"
   ```

7. Old plans are NEVER deleted — they form a historical training path.

### Plan Presentation (ck:report:plan)

When user requests the plan:

```
📋 **本周学习计划** (W16)

🎯 **主攻**: Writing — 连贯性 + TEEL 段落结构
🔄 **辅攻**: Speaking — Part 1 扩展 + Part 3 深度

📅 **建议安排**:
- Mon: ✍️ TEEL Drill (段落练习)
- Tue: 🗣️ Guided QA (问答扩展)
- Wed: ✍️ Full Task 2 (完整写作 + 重写)
- Thu: 🎧 Dictation (听写训练)
- Fri: 🗣️ Examiner Sim (考官模拟)

⚠️ **上周遗留**: sv_agreement, cohesion_missing
💡 **难度调整**: 写作降低难度，增加支架

[KEYBOARD:
✍️ 开始写作=ck:writing | 🗣️ 开始口语=ck:speaking | 🏠 返回=ck:menu
]
```

`tg(type:"pin")` the plan message.

### Manual Focus Override

When learner sends `/focus <area>`:

- Update MEMORY.md's Current Focus → Primary via `memory` tool
- Do NOT modify the plan table — the plan stays as scheduled
- This is a temporary override that the next weekly plan will reset

## Rules

1. **One plan per week.** Don't create mid-week plans.
2. **Plans are suggestions, not mandates.** The learner can practice whatever they want.
3. **Always consider the timeline.** If the test is in 2 weeks, focus on weakest high-impact areas.
4. **3-week rotation.** Don't let the same skill dominate for 3+ consecutive weeks.
5. **Reference concrete exercises.** "Practice writing" is too vague. "TEEL drill on opinion essay about education" is good.
6. **Include carry-over errors.** Persistent errors from last week must be addressed.
7. **Respect difficulty feedback.** If user reported "too_hard", lower difficulty in the plan.
8. **At least 1 dictation per week** for all levels.
9. **Pin the plan message** so the learner can reference it easily.
