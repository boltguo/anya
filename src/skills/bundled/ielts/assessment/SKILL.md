---
name: assessment
description: 'IELTS eval: 3 modes — daily cron / weekly cron / on-demand + difficulty tracking'
version: '2.0.0'
metadatahermes:
  tags: [ielts, assessment, evaluation, band, report]
  category: anya
---

# Assessment Engine

## When to Use

- **Light**: cron 22:00 daily
- **Deep**: cron Sunday 20:00
- **On-demand**: `assessment` callback or "测评" keyword
- Never from individual training sessions (that's `data`'s job)

## Resources

- **Report templates**: `./assessment/templates/report.md`
- **Error taxonomy**: `./assessment/references/error_taxonomy.md`

## MEMORY Field Derivation

How each MEMORY.md field is computed from learner.db:

| MEMORY Field                            | Source query                             | Derivation logic                                                                    |
| --------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------- |
| `IELTS Bands`                           | `list-samples --since 7d`                | EMA α=0.3 on per-skill band scores. **Samples with redo_count=0 have 0.7× weight.** |
| `Top Errors`                            | `list-errors --limit 20`                 | Top N by count, must use taxonomy key                                               |
| `Weak Dimensions`                       | `list-errors --category grammar,lexical` | Map recurrence_keys → IELTS sub-criterion                                           |
| `Vocabulary.cefr`                       | `list-samples` writing/speaking text     | Estimate from avg word complexity in output                                         |
| `Vocabulary.weak_domains`               | `list-errors --category lexical`         | Cluster word_choice/word_form errors by topic                                       |
| `Grammar Profile.mastered`              | `list-samples`                           | Structures used correctly in ≥3 samples, no errors                                  |
| `Grammar Profile.weak`                  | `list-errors --category grammar`         | Structures with recurrence_key hits ≥2                                              |
| `Speaking Profile.fluency`              | `list-samples --skill-type speaking`     | Coherence sub-score: <4=hesitant, 4-5=moderate, >5=fluent                           |
| `Speaking Profile.pronunciation_weak`   | `list-errors --skill speaking`           | Errors tagged with pronunciation recurrence_key                                     |
| `Reading Profile.pace`                  | `list-samples --skill-type reading`      | Low accuracy on time-sensitive question types → slow                                |
| `Study Consistency.streak_days`         | `list-samples`                           | Count consecutive days with ≥1 sample                                               |
| `Study Consistency.avg_weekly_sessions` | `list-samples --since 28d`               | Total sessions ÷ 4 weeks                                                            |

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
4. Update MEMORY.md: `IELTS Bands`, `Top Errors`, `Weak Dimensions`, `Study Consistency`

### Deep Evaluation (Sunday 20:00)

Full weekly analysis. Produces a visible report.

1. Query 7-day samples + error stats: `list-samples --since 7d`, `list-errors --since 7d --limit 50`
2. Analyze:
   - Rolling bands per skill (this week vs last week)
   - Improvement / stagnation / regression per skill
   - New weaknesses emerging
   - Mode distribution (which modes were practiced)
   - Difficulty feedback distribution (too_hard/just_right/too_easy ratio)
   - Redo completion rate
3. Update ALL MEMORY.md fields:
   - `IELTS Bands` — fresh EMA across full week
   - `Vocabulary` — CEFR re-estimate, known/weak domains from lexical errors
   - `Grammar Profile` — mastered structures (used correctly ≥3×), weak (error hits ≥2×)
   - `Weak Dimensions` — per-skill IELTS sub-criterion with highest error rate
   - `Speaking Profile` — fluency from Coherence sub-scores, pronunciation_weak from speaking errors
   - `Reading Profile.pace` — inferred from reading accuracy patterns
   - `Focus` — set primary/secondary from biggest gap between current band and target
   - `Top Errors` — top 3-5 recurrence_keys from week
   - `Study Consistency` — streak_days + avg_weekly_sessions
4. Trigger `planner` for next week's plan
5. Send weekly report to learner:

```
📊 **本周学习报告** ({{week_range}})

| 技能 | 上周 | 本周 | 趋势 | 练习次数 |
|---|---|---|---|---|
| ✍️ Writing | {{w_last}} | {{w_now}} | {{w_trend}} | {{w_count}} |
| 🗣️ Speaking | {{s_last}} | {{s_now}} | {{s_trend}} | {{s_count}} |
| 📖 Reading | {{r_last}} | {{r_now}} | {{r_trend}} | {{r_count}} |
| 🎧 Listening | {{l_last}} | {{l_now}} | {{l_trend}} | {{l_count}} |

📈 **最大进步**: {{biggest_improvement}}
⚠️ **持续弱项**: {{persistent_weakness}}
🔄 **重做完成率**: {{redo_rate}}%

[KEYBOARD:
📋 下周计划=report_plan | 📊 详细数据=report_detail | 🏠 返回=menu
]
```

6. `tg(type:"pin")` the weekly report message.

### On-Demand Assessment (User-Initiated)

Interactive level check. ~10-15 minutes.

1. Greet (template in `templates/report.md`)
2. Four mini-tasks in sequence:
   - **Speaking** (2 min): 3 Part 1 questions (force_reply) + optional 20s voice → `pron_assess`
   - **Listening** (2 min): 2 sentence dictations (tts + force_reply) + 1 short clip quiz
   - **Reading** (3 min): ~150-word passage + 3 mixed questions
   - **Writing** (3-5 min): 60-90 word short paragraph (force_reply), 4D band
3. Compile: query band-history for comparison
4. Update MEMORY.md: `IELTS Bands`, `Weak Dimensions`, `Speaking Profile.fluency`, `Study Consistency`
5. Present report with inline keyboard:

```
📋 **测评完成！**

| 技能 | 当前 | vs 上次 | 置信度 |
|---|---|---|---|
| ✍️ Writing | {{w_band}} | {{w_delta}} | {{w_conf}} |
| 🗣️ Speaking | {{s_band}} | {{s_delta}} | {{s_conf}} |
| 📖 Reading | {{r_band}} | {{r_delta}} | {{r_conf}} |
| 🎧 Listening | {{l_band}} | {{l_delta}} | {{l_conf}} |

💪 优势: {{strengths}}
⚠️ 薄弱点: {{weaknesses}}

[KEYBOARD:
📊 详细分析=report_detail | 📋 学习计划=report_plan | 🎯 开始练习=menu
]
```

6. Record samples via `data`

### Detailed Report (report_detail)

When user taps "详细数据":

- Show per-skill breakdown with sub-scores
- Top 5 errors with examples and recurrence count
- Mode distribution chart (text-based)
- Difficulty feedback summary
- Vocabulary growth stats (total words, transfer level distribution)

## Rules

1. **Light is silent.** Never message at 22:00.
2. **Deep produces a report.** Always send the weekly report + trigger planner + pin.
3. **On-demand is interactive.** Bilingual, immediate feedback after each skill.
4. **EMA smoothing** for band updates — one bad session won't tank the score.
5. **redo_count=0 samples weighted at 0.7×** — sessions without redo are less reliable.
6. **Assessment never writes to learner.db directly.** Writes go through `data`.
7. **On-demand doesn't trigger planner.** That's only for deep eval.
8. **All errors use taxonomy keys** from `references/error_taxonomy.md`.
9. **Only update fields you have data for.** If a field can't be derived from today's samples, leave it unchanged.
10. **Trend arrows**: ↑ (improved ≥0.5), → (stable), ↓ (declined ≥0.5).
