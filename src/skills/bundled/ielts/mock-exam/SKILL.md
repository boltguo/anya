---
name: mock-exam
description: 'Integrated mock exams: full 4-skill test / biweekly focus / weekly check — with stability scoring'
---

# Mock Exam — Integration & Stability Verification

## Pedagogical Foundation

- **PRD §8.4**: Validates that single-skill training transfers to exam performance
- **Stability > Single Performance**: Mock results produce variance + trough metrics, not just a score
- **PRD §6.4**: "7–7.5 is not one peak performance, but N performances with low variance and high mean"
- **Ericsson Deliberate Practice**: Post-mock analysis directs the next training cycle

## When to Use

- Callback: `mock:full`, `mock:biweekly`, `mock:weekly`, `mock:start`, `mock:errors`, `mock:schedule`
- Orchestrator schedule: full=monthly, biweekly=every 2 weeks, weekly=every week
- On-demand: learner says "模考", "mock exam", "考试模拟"

### Callback Routing

| Callback | Action |
|---|---|
| `mock:full` / `mock:biweekly` / `mock:weekly` | Show Pre-Mock confirmation |
| `mock:start` | Begin the exam (after Pre-Mock confirmation) |
| `mock:errors` | Show detailed error analysis from last mock |
| `mock:schedule` | Show next scheduled mock date + allow rescheduling |

## Resources

- **Stage transition rules**: `../orchestrator/references/stage_transition_rules.md`
- **Subcap catalog**: `../assessment/references/subcap_catalog.md`

## Three Modes

### Full Mock (Monthly) — `mock:full`

**Duration**: ~2h 45min (can be split across 2 sessions)
**Load score**: 5 per section (20 total)

| Section | Duration | Task |
|---|---|---|
| Listening | 30 min | 4 sections, 40 questions (generated, not real IELTS) |
| Reading | 60 min | 3 passages, 40 questions |
| Writing | 60 min | Task 1 (150+ words) + Task 2 (250+ words) |
| Speaking | 15 min | Part 1 (4-5 min) + Part 2 (3-4 min) + Part 3 (4-5 min) |

**Strict timing**: Use countdown warnings at 50%, 75%, 90% of allocated time.

### Biweekly Focus (Every 2 Weeks) — `mock:biweekly`

**Duration**: ~40 min
**Load score**: 4

Tests the current `Active Driver` primary skill only:
- Read MEMORY `Active Driver.primary_focus` to determine which skill
- Generate a focused section-length test
- Include question types the learner has been weakest on

### Weekly Check (Weekly) — `mock:weekly`

**Duration**: ~15 min
**Load score**: 3

Quick mixed check:
- 2 listening questions (dictation + clip)
- 1 reading passage (5 questions)
- 1 short writing task (60-90 words) OR 3 speaking questions
- Randomly selected — prevents learner from predicting and over-preparing

## Protocol

### Pre-Mock

1. Read MEMORY for current bands, path, stage
2. Check daily load budget — warn if nearly spent
3. Set exam conditions:

```
📋 **模考准备**

类型: {{mock_type}}
预估时间: {{duration}}
严格计时: ✅

⚠️ 模考期间不会给提示和反馈。考完后统一出报告。

准备好了吗？

[KEYBOARD:
▶️ 开始=mock:start | ⏭️ 下次再考=practice
]
```

### During Mock

- **No feedback during the test.** No corrections, no hints, no encouragement.
- **Strict timing.** Send countdown warnings.
- **Record raw responses.** Don't score in real-time.
- For Full Mock: allow splitting across 2 sessions (save progress in feedback field)

### Post-Mock Scoring

Score all sections using standard IELTS criteria:

1. **Per-section band scores** (0.5 increments)
2. **Sub-scores** where applicable (writing 4D, speaking 4D)
3. **Subcap scores** for all relevant keys
4. **Error classification** with taxonomy keys + root cause tags

### Post-Mock Report

```
📊 **模考报告** — {{mock_type}} ({{date}})

| 技能 | 得分 | vs 上次模考 | vs 训练均值 |
|---|---|---|---|
| 🎧 Listening | {{l_band}} | {{l_delta}} | {{l_vs_train}} |
| 📖 Reading | {{r_band}} | {{r_delta}} | {{r_vs_train}} |
| ✍️ Writing | {{w_band}} | {{w_delta}} | {{w_vs_train}} |
| 🗣️ Speaking | {{s_band}} | {{s_delta}} | {{s_vs_train}} |
| **Overall** | **{{overall}}** | **{{o_delta}}** | |

▍ 稳定性 (近 3 次模考)
  均值: {{mock_mean}} · 方差: {{mock_std}} · 谷值: {{mock_trough}}
  状态: {{stability_verdict}}

▍ 迁移验证
  {{transfer_analysis}}

▍ 子能力弱点 (from this mock)
  {{sub1_key}}  {{sub1_score}}
  {{sub2_key}}  {{sub2_score}}
  {{sub3_key}}  {{sub3_score}}

▍ 下一步建议
  {{recommendation}}

[KEYBOARD:
📊 详细错误分析=mock:errors | 🎯 调整训练=orchestrator
📋 下次模考=mock:schedule | 🏠 返回=practice
]
```

### Transfer Analysis

Compare mock performance vs. daily training performance for each skill:

| Pattern | Interpretation | Action |
|---|---|---|
| Training high, Mock high | Transfer successful | Continue current approach |
| Training high, Mock low | Transfer gap — needs integration practice | More timed practice, pressure simulation |
| Training low, Mock low | Still building — expected | Continue skill-focused training |
| Training low, Mock high | Lucky or small sample — don't trust | Continue training, retest |

### Stage Transition Check

After every full mock, check `orchestrator/references/stage_transition_rules.md`:
- If transition criteria met → include `🎯 确认阶段跃迁=orchestrator:run` button in the report
- If demotion criteria met → include `⚠️ 调整训练计划=orchestrator:run` button in the report
- Always update MEMORY `Active Driver` based on mock results
- **Do not** chain-invoke orchestrator implicitly — let the user or daily cron trigger it

## Record Keeping

```
db name=learner sql="INSERT INTO mock_sessions (created_at, type, band_listening, band_reading, band_writing, band_speaking, band_overall, stability_score, notes) VALUES (datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?)" params='["full", 6.5, 6.0, 5.5, 6.0, 6.0, 0.35, "Transfer gap in writing under time pressure"]'
```

Also record individual section samples in `samples` table with `load_score` and `subcap_scores`.

## Metacognitive Hooks

Before scoring:
```
tg(type:"force_reply", text:"你觉得这次模考大概几分？（直接输入数字，如 6.0）")
```

After receiving error analysis:
```
tg(type:"force_reply", text:"你觉得最大的失分原因属于哪类？语言知识不足 / 认知处理来不及 / 考试策略不对")
```

Record both predictions. Store gap in MEMORY `Metacognition.self_prediction_gap` and attribution accuracy in `Metacognition.self_attribution_accuracy`. Never mark predictions as "wrong".

## Rules

1. **No feedback during the test.** Exam simulation must be realistic.
2. **Strict timing.** Warn but don't auto-submit (learner may be typing).
3. **All content must be original.** Never use real IELTS materials.
4. **Record everything.** Every section → sample + subcap_scores + errors + mock_session.
5. **Transfer analysis is mandatory** in every report — this is the core value of mock exams.
6. **Stability metrics** must be calculated from the last 3 mock sessions if available.
7. **Stage transition check** after every full mock — never skip.
8. **Load score per section.** Don't allow a full mock if daily budget is nearly spent.
