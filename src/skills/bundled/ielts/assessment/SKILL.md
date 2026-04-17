---
name: assessment
description: 'IELTS eval: 4 modes — daily light / weekly deep / biweekly focus / on-demand + subcap profiling + stability tracking'
---

# Assessment Engine — Capability Portrait System

## Pedagogical Foundation

- **Krashen i+1**: Material difficulty selection for on-demand assessment tasks
- **Ericsson Deliberate Practice**: Root cause identification drives targeted next actions
- **Stability > Single Performance** (PRD §6.4): All band outputs carry variance + trough metrics

## When to Use

- **Light**: cron 22:00 daily
- **Deep**: cron Sunday 20:00
- **Biweekly**: cron every other Sunday 20:00 (alternates with Deep)
- **On-demand**: `assessment` callback or "测评" keyword
- Never from individual training sessions (that's `database`'s job)

## Resources

- **Report templates**: `templates/report.md`
- **Error taxonomy**: `references/error_taxonomy.md`
- **Sub-capability catalog**: `references/subcap_catalog.md`

## MEMORY Field Derivation

How each MEMORY.md field is computed from learner.db:

| MEMORY Field                            | Source query                             | Derivation logic                                                                    |
| --------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------- |
| `IELTS Bands`                           | `db name=learner sql="SELECT ... FROM samples WHERE created_at >= date('now','-7 days')"` | EMA α=0.3 on per-skill band scores. **Samples with redo_count=0 have 0.7× weight.** |
| `Top Errors`                            | `db name=learner sql="SELECT recurrence_key, COUNT(*) as cnt FROM errors GROUP BY recurrence_key ORDER BY cnt DESC LIMIT 20"` | Top N by count, must use taxonomy key |
| `Weak Dimensions`                       | `db name=learner sql="SELECT * FROM errors WHERE category IN ('grammar','lexical')"` | Map recurrence_keys → IELTS sub-criterion |
| `Vocabulary.cefr`                       | `db name=learner sql="SELECT raw_content, skill_type FROM samples WHERE skill_type IN ('writing','speaking') ORDER BY created_at DESC LIMIT 20"` | Estimate from avg word complexity in output |
| `Vocabulary.weak_domains`               | `db name=learner sql="SELECT recurrence_key, original_phrase, correction FROM errors WHERE category='lexical' ORDER BY id DESC LIMIT 50"` | Cluster lexical errors by topic |
| `Grammar Profile.mastered`              | `db name=learner sql="SELECT raw_content FROM samples ORDER BY created_at DESC LIMIT 30"` | Structures used correctly in ≥3 samples, no repeated errors |
| `Grammar Profile.weak`                  | `db name=learner sql="SELECT recurrence_key, COUNT(*) as cnt FROM errors WHERE category='grammar' GROUP BY recurrence_key ORDER BY cnt DESC"` | Structures with recurrence_key hits ≥2 |
| `Speaking Profile.fluency`              | `db name=learner sql="SELECT band_coherence FROM samples WHERE skill_type='speaking' AND band_coherence IS NOT NULL ORDER BY created_at DESC LIMIT 10"` | Coherence sub-score: <4=hesitant, 4-5=moderate, >5=fluent |
| `Speaking Profile.pronunciation_weak`   | `db name=learner sql="SELECT recurrence_key, COUNT(*) as cnt FROM errors e JOIN samples s ON e.sample_id=s.id WHERE s.skill_type='speaking' AND e.category='pronunciation' GROUP BY recurrence_key ORDER BY cnt DESC"` | Errors tagged with pronunciation recurrence_key |
| `Reading Profile.pace`                  | `db name=learner sql="SELECT feedback FROM samples WHERE skill_type='reading' AND feedback != '' ORDER BY created_at DESC LIMIT 20"` | Parse JSON from `feedback` field: extract `wpm`, `reading_time_sec`, `question_accuracy` |
| `Study Consistency.streak_days`         | `db name=learner sql="SELECT DISTINCT date(created_at) as d FROM samples ORDER BY d DESC LIMIT 30"` | Count consecutive days with ≥1 sample |
| `Study Consistency.avg_weekly_sessions` | `db name=learner sql="SELECT COUNT(*) as total FROM samples WHERE created_at >= date('now','-28 days')"` | Total sessions ÷ 4 weeks |
| `Active Driver`                         | 7-day samples + errors + subcap_scores + MEMORY target | Set current training direction: focus, modes, support level, watch-errors, next step, stability_status, next_micro_action |

## Protocol

### Light Evaluation (Daily 22:00)

Silent background update. No message to learner.

1. Query today's samples: `db name=learner sql="SELECT * FROM samples WHERE created_at >= date('now') ORDER BY created_at DESC"`
2. If no samples → update `streak_days: 0`, skip all other fields
3. Compute from today's data:
   - EMA-smoothed band per skill (α=0.3). Samples with `redo_count=0` weighted at 0.7×.
   - Top 3 error recurrence_keys
   - Weak Dimensions (dominant IELTS sub-criteria in errors)
   - `streak_days` (consecutive days with samples)
4. Query today's subcap_scores:

```
db name=learner sql="SELECT subcap_key, AVG(score) as avg_score FROM subcap_scores WHERE created_at >= date('now') GROUP BY subcap_key"
```

5. Update MEMORY.md: `IELTS Bands`, `Top Errors`, `Weak Dimensions`, `Study Consistency`
6. Update `Daily Load.consumed` from today's load_score sum

### Deep Evaluation (Sunday 20:00)

Full weekly analysis. Produces a visible report with sub-capability radar + stability tracking.

1. Query 7-day samples + error stats + subcap_scores via `db` tool
2. Analyze:
   - Rolling bands per skill (this week vs last week)
   - Improvement / stagnation / regression per skill
   - New weaknesses emerging
   - Mode distribution (which modes were practiced)
   - Difficulty feedback distribution (parse `feedback` field JSON for `difficulty` key: too_hard/just_right/too_easy)
   - Redo completion rate
3. **Subcap Radar** — aggregate subcap_scores from the past 14 days:

```
db name=learner sql="SELECT subcap_key, ROUND(AVG(score),1) as avg_score, COUNT(*) as n, ROUND(AVG(CASE WHEN created_at >= date('now','-7 days') THEN score END),1) as this_week, ROUND(AVG(CASE WHEN created_at < date('now','-7 days') AND created_at >= date('now','-14 days') THEN score END),1) as last_week FROM subcap_scores WHERE created_at >= date('now','-14 days') GROUP BY subcap_key ORDER BY avg_score ASC"
```

4. **Stability Metrics** — compute for each skill:

```
db name=learner sql="SELECT skill_type, ROUND(AVG(band_overall),1) as band_mean, ROUND(AVG((band_overall - (SELECT AVG(band_overall) FROM samples s2 WHERE s2.skill_type = s.skill_type AND s2.created_at >= date('now','-30 days'))) * (band_overall - (SELECT AVG(band_overall) FROM samples s2 WHERE s2.skill_type = s.skill_type AND s2.created_at >= date('now','-30 days')))),2) as band_var, MIN(band_overall) as trough_30d FROM samples s WHERE band_overall IS NOT NULL AND created_at >= date('now','-30 days') GROUP BY skill_type"
```

5. **Root Cause Distribution** — classify top 20 errors by root cause:
   - Map each `recurrence_key` to root cause tag (`root:language` / `root:cognitive` / `root:strategy`)
   - Calculate percentage distribution
6. Update ALL MEMORY.md fields:
   - `IELTS Bands` — fresh EMA across full week
   - `Vocabulary` — CEFR re-estimate, known/weak domains from lexical errors
   - `Grammar Profile` — mastered structures (used correctly ≥3×), weak (error hits ≥2×)
   - `Weak Dimensions` — per-skill IELTS sub-criterion with highest error rate
   - `Speaking Profile` — fluency from Coherence sub-scores, pronunciation_weak from speaking errors
   - `Reading Profile.pace` — inferred from reading accuracy patterns
   - `Active Driver` — set primary/secondary focus, recommended modes, support level, topic bias, watch-errors, next step, **stability_status**, and **next_micro_action** from the biggest current bottleneck
   - `Top Errors` — top 3-5 recurrence_keys from week
   - `Study Consistency` — streak_days + avg_weekly_sessions
7. Send weekly report to learner (see report template below)
8. `tg(type:"pin")` the weekly report message.
9. Include `🎯 刷新训练计划=orchestrator:run` button in the report keyboard. The orchestrator is triggered explicitly by user tap or by the daily cron — **not** by implicit chained skill invocation from assessment.

### Biweekly Deep Dive (Every Other Sunday 20:00)

Focused 14-day analysis on the current primary driver's skill area.

1. Query 14-day data for the primary driver's skill type only
2. Deep-analyze the specific subcap trends for that skill
3. Generate 10 targeted micro-drill questions based on weakest subcaps
4. Output a focused report:

```
🔬 **双周深挖** — {{primary_skill}} ({{date_range}})

▍ 子能力趋势 (14 天)
  {{subcap_1}}  ▓▓▓▓▓▓░░░░  {{score_1}}  {{trend_1}}
  {{subcap_2}}  ▓▓▓▓▓░░░░░  {{score_2}}  {{trend_2}}
  {{subcap_3}}  ▓▓▓▓░░░░░░  {{score_3}}  {{trend_3}}

▍ 根因分布
  语言层 {{lang_pct}}% · 认知层 {{cog_pct}}% · 策略层 {{str_pct}}%

▍ 最有效训练模式: {{best_mode}}
▍ 进步最大子能力: {{most_improved}}

[KEYBOARD:
🎯 开始专项训练={{primary_cb}} | 📊 完整报告=assessment | 🏠 返回=menu
]
```

### On-Demand Assessment (User-Initiated)

Interactive level check. ~10-15 minutes.

1. Greet (template in `templates/report.md`)
2. Four mini-tasks in sequence:
   - **Speaking** (2 min): 3 Part 1 questions (force_reply) + optional 20s voice → `pron_assess`
   - **Listening** (2 min): 2 sentence dictations (tts + force_reply) + 1 short clip quiz
   - **Reading** (3 min): ~150-word passage + 3 mixed questions
   - **Writing** (3-5 min): 60-90 word short paragraph (force_reply), 4D band
3. **Score each mini-task with subcap_scores**: write to `subcap_scores` table for each assessed subcap
4. Compile: query band-history for comparison + compute stability
5. Update MEMORY.md: `IELTS Bands`, `Weak Dimensions`, `Speaking Profile.fluency`, `Study Consistency`
   - Refresh `Active Driver.next_step` if the assessment reveals a clear immediate bottleneck
   - Set `Active Driver.stability_status`: stable / volatile / unknown
   - Set `Active Driver.next_micro_action`: one actionable sentence with callback
6. Present report with subcap radar + inline keyboard (see templates)
7. Record samples via `db` tool (see `database` skill for queries)

### Weekly Report Template (Updated)

```
📊 **本周学习报告** — {{week_range}}

▍ Overall
  均值 {{band_overall}} · 方差 {{band_std}} · 稳定性 {{stability_emoji}}

| 技能 | 上周 | 本周 | 趋势 | 稳定性 | 练习 |
|---|---|---|---|---|---|
| ✍️ Writing | {{w_last}} | {{w_now}} | {{w_trend}} | {{w_stable}} | {{w_count}} |
| 🗣️ Speaking | {{s_last}} | {{s_now}} | {{s_trend}} | {{s_stable}} | {{s_count}} |
| 📖 Reading | {{r_last}} | {{r_now}} | {{r_trend}} | {{r_stable}} | {{r_count}} |
| 🎧 Listening | {{l_last}} | {{l_now}} | {{l_trend}} | {{l_stable}} | {{l_count}} |

▍ 子能力雷达 (最薄弱 6 项)
  {{sub1_key}}  ▓▓▓▓▓░░░░░  {{sub1_score}}
  {{sub2_key}}  ▓▓▓▓░░░░░░  {{sub2_score}}
  {{sub3_key}}  ▓▓▓▓░░░░░░  {{sub3_score}}
  {{sub4_key}}  ▓▓▓░░░░░░░  {{sub4_score}}
  {{sub5_key}}  ▓▓▓░░░░░░░  {{sub5_score}}
  {{sub6_key}}  ▓▓░░░░░░░░  {{sub6_score}}

▍ 根因分布
  语言层 {{lang_pct}}% · 认知层 {{cog_pct}}% · 策略层 {{str_pct}}%

▍ 提分杠杆 (下一步最值得做)
  1. {{lever_1}}  预期收益 +{{gain_1}}
  2. {{lever_2}}  预期收益 +{{gain_2}}

🔄 重做完成率: {{redo_rate}}%
📈 最大进步: {{biggest_improvement}}
⚠️ 持续弱项: {{persistent_weakness}}

[KEYBOARD:
🎯 开始杠杆1={{cb_1}} | 🎯 开始杠杆2={{cb_2}}
📊 详细数据=report_detail | 🎯 当前驱动=report_focus
🔄 重评估=assessment | 🏠 返回=menu
]
```

Stability emoji: ✅ (std ≤ 0.3) / ⚠️ (std 0.3-0.6) / 🔴 (std > 0.6)

### Stability Tracking Block (appended to Deep report)

```
▍ 稳定性追踪
  近 10 次 writing band: mean {{w_mean}}, std {{w_std}}, trough {{w_trough}}  →  {{w_verdict}}
  近 10 次 speaking band: mean {{s_mean}}, std {{s_std}}, trough {{s_trough}}  →  {{s_verdict}}
  近 10 次 reading band:  mean {{r_mean}}, std {{r_std}}, trough {{r_trough}}  →  {{r_verdict}}
  近 10 次 listening band: mean {{l_mean}}, std {{l_std}}, trough {{l_trough}} →  {{l_verdict}}

  结论: {{stability_conclusion}}
```

Verdicts: ✅ 接近稳态 / ⚠️ 波动偏大 / 🔴 高度不稳定

### Detailed Report (report_detail)

When user taps "详细数据":

- Show per-skill breakdown with sub-scores
- Top 5 errors with examples and recurrence count
- Mode distribution chart (text-based)
- Difficulty feedback summary
- Vocabulary growth stats (total words, transfer level distribution)
- **Rewrite chain summary**: how many same-topic rewrites, average improvement per chain

### Current Driver Snapshot (report_focus)

When user taps "当前驱动":

- Show the current `Active Driver` block from MEMORY.md in learner-friendly language
- Include:
  - primary focus
  - secondary focus
  - recommended modes
  - support level
  - watch-errors
  - next step
  - **stability_status** (stable / volatile / unknown)
  - **next_micro_action** with callback
  - short reason
- Keep it short and actionable, not like a weekly timetable

## Rules

1. **Light is silent.** Never message at 22:00.
2. **Deep produces a report.** Always send the weekly report, refresh `Active Driver`, pin, and include `orchestrator:run` button for the learner to refresh their training plan.
3. **Biweekly is a deep-dive.** On alternating Sundays, replace the standard Deep with a Biweekly focused analysis.
4. **On-demand is interactive.** Bilingual, immediate feedback after each skill. Writes subcap_scores.
5. **EMA smoothing** for band updates — one bad session won't tank the score.
6. **redo_count=0 samples weighted at 0.7×** — sessions without redo are less reliable.
7. **Assessment never writes to learner.db directly outside of the `db` tool.** Use parameterized queries.
8. **No weekly plan generation.** The system is driven by MEMORY's `Active Driver` + orchestrator's `daily_tasks`, not a weekly timetable.
9. **All errors use taxonomy keys** from `references/error_taxonomy.md`.
10. **All subcap scores use keys** from `references/subcap_catalog.md`.
11. **Only update fields you have data for.** If a field can't be derived from today's samples, leave it unchanged.
12. **Trend arrows**: ↑ (improved ≥0.5), → (stable), ↓ (declined ≥0.5).
13. **Root cause tags** must be applied when classifying errors for reporting.
14. **Stability metrics** are mandatory in Deep and On-demand reports — never omit variance and trough.
