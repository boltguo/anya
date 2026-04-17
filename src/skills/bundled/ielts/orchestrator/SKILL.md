---
name: orchestrator
description: 'Path scheduling hub: A/B/C path type + 4-stage progression + daily load budget + task dispatch'
---

# Orchestrator — Path Scheduling Hub

## Pedagogical Foundation

- **Krashen i+1**: Path type A emphasizes 70% comprehensible input
- **Ericsson Deliberate Practice**: Path type B emphasizes high-quality output + error correction
- **Cognitive Load Management** (PRD §9.4): Daily load budget prevents fatigue-induced error fossilization
- **Stability > Single Performance** (PRD §6.4): Stage transitions require both mean and variance criteria

## When to Use

- Triggered by daily cron (08:00) — generates today's 3 tasks
- Triggered by `assessment` Deep eval (Sunday 20:00) — via `orchestrator:run` button in report
- Callback: `orchestrator` or `orchestrator:run`
- `init` Phase 4B completion — first-time path assignment
- Never called from training sessions directly
- Never chain-invoked implicitly by other skills — always via cron or explicit callback

## Resources

- **Stage transition rules**: `references/stage_transition_rules.md`
- **Subcap catalog**: `../assessment/references/subcap_catalog.md`

## Five Core Responsibilities

### 1. Path Decision (A / B / C)

Based on the current `IELTS Bands.Overall` from MEMORY:

| Path | Band Range | Primary Strategy | Training Mix |
|---|---|---|---|
| **A** (Foundation) | 4.5 – 5.5 | Language system rebuild | 70% input + 30% diagnostic |
| **B** (Plateau Break) | 5.5 – 6.5 | High-quality output + error pattern correction | 50% output + 30% feedback + 20% input |
| **C** (Sprint) | 6.5 – 7.0+ | Precision refinement + stability | 40% timed practice + 30% error elimination + 30% integration |

Write to MEMORY:

```
## Path
  type: B
  since: {{date}}
  rationale: {{one-line reason}}
```

### 2. Stage Decision (4-Stage Progression)

| Stage | Description | Entry Criteria |
|---|---|---|
| `diagnose` | Baseline assessment + profile building | Init completion |
| `breakthrough` | Focused skill-specific training | Baseline done |
| `integrate` | Cross-skill timed practice | See stage_transition_rules.md |
| `sprint` | Final polish + exam readiness | See stage_transition_rules.md |

Write to MEMORY:

```
## Current Stage
  stage: breakthrough
  since: {{date}}
  criteria_met: [baseline_done]
  next_gate: primary_stable_2w
```

Load `references/stage_transition_rules.md` before making any stage transition.

### 3. Daily Load Budget

| Path | Daily Budget | High-intensity cap |
|---|---|---|
| A | 8 | Max 1 examiner-sim / full-task per day |
| B | 12 | Max 2 high-intensity per day |
| C | 15 | Max 3 high-intensity per day |

Load score reference (each mode declares its own in SKILL.md):

| Score | Intensity | Examples |
|---|---|---|
| 1 | Low | ext-reading, ext-listening, shadowing, word review |
| 2 | Medium | sentence-lab, sound-drill, flash-skim, dictation |
| 3 | High | TEEL drill, guided QA, cue-card-build, standard reading |
| 4 | Very High | Full writing task, examiner-sim, lecture listening |
| 5 | Maximum | Full mock exam section |

Query today's consumed load:

```
db name=learner sql="SELECT COALESCE(SUM(load_score), 0) as consumed FROM samples WHERE created_at >= date('now') AND load_score > 0"
```

Write to MEMORY:

```
## Daily Load
  date: {{today}}
  budget: 12
  consumed: {{sum}}
  remaining: {{budget - sum}}
```

### 4. Task Dispatch (Today's 3 Tasks)

Generate three tasks based on:
- Current `Active Driver` (primary focus → primary task)
- Recent error patterns (→ review task)
- Path type training mix (→ consolidation task)
- Remaining load budget
- Time since last practice of each skill (avoid 3+ day gaps)

Write to `daily_tasks`:

```
db name=learner sql="INSERT INTO daily_tasks (date, task_type, skill, mode, callback, load_score) VALUES (date('now'), ?, ?, ?, ?, ?)" params='["primary", "writing", "sentence-lab", "writing:sentlab", 2.0]'
```

Each task must have:
- `task_type`: primary / review / consolidation
- `skill`: writing / speaking / reading / listening / words
- `mode`: specific mode name
- `callback`: valid callback_data for Telegram
- `load_score`: from the mode's declared load_score

### 5. Stage Transition Judgement

Read `references/stage_transition_rules.md` before executing.

If transition criteria are met:
1. Record in `stage_transitions` table
2. Update MEMORY `Current Stage`
3. Notify learner with celebration:

```
🎉 **阶段跃迁！**

从 {{from_stage}} → {{to_stage}}
原因: {{reason}}

新阶段重点: {{new_focus}}

[KEYBOARD:
🎯 查看新计划=orchestrator | 🏠 返回=menu
]
```

## Protocol

### Standard Run (Post-Assessment)

1. Read MEMORY.md: bands, Active Driver, current path/stage
2. Read subcap summary from assessment
3. **Path check**: if band has shifted across path boundaries, update path type
4. **Stage check**: evaluate transition criteria, advance if met
5. **Generate today's 3 tasks**: considering path mix, driver, load budget
6. **Write daily_tasks** to learner.db
7. **Update MEMORY**: Path, Stage, Daily Load
8. **Output summary** (only if triggered manually, not after cron-assessment):

```
📋 **学习路径** — {{path_type}} · {{stage}}

📊 今日负荷  ▓▓▓░░░░░░░  {{consumed}}/{{budget}}

🔴 主项 · {{primary_task}} [开始={{cb1}}]
🟡 复习 · {{review_task}} [开始={{cb2}}]
🟢 巩固 · {{consolidation_task}} [开始={{cb3}}]

[KEYBOARD:
🎯 驱动详情=report_focus | 📊 画像=assessment
📚 自选菜单=nav:menu_full | 📖 延展轨=nav:menu_ext
]
```

### First Run (Post-Init)

1. Determine initial path type from baseline assessment bands
2. Set initial stage to `diagnose` → immediately promote to `breakthrough` if baseline is complete
3. Generate first day's tasks with emphasis on assessment gaps
4. Write all MEMORY fields

## Metacognitive Hooks (Phase 4)

At the end of each week (Sunday orchestrator run):

1. Send a bilingual reflection prompt:

```
tg(type:"force_reply", text:"📝 Weekly reflection (用英文回答):\nWhat was the most helpful exercise this week? Where do you still feel stuck?")
```

2. Score the reflection as a writing sample (`skill_type='reflection'`)
3. Archive key insights for coaching strategy updates

## Rules

1. **Path type is derived from data**, not user preference. If user manually requests a different path, allow but add a biweekly sanity check.
2. **Stage transitions are conservative.** When in doubt, stay at current stage. A biweekly mock must confirm before advancing.
3. **Daily tasks sum ≤ remaining budget.** If budget is nearly used up, suggest only low-intensity consolidation.
4. **Idempotent daily run.** If today's `daily_tasks` already exist, skip task generation. Only regenerate if manually called with explicit override.
5. **Use load_score values declared by each skill**, not ad-hoc estimates.
6. **Every transition is recorded** in `stage_transitions` with a reason.
7. **All subcap keys from subcap_catalog.md** — no invented keys.
