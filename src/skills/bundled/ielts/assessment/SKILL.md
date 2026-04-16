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
- Never from individual training sessions (that's `database`'s job)

## Resources

- **Report templates**: `./assessment/templates/report.md`
- **Error taxonomy**: `./assessment/references/error_taxonomy.md`

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
| `Reading Profile.pace`                  | `db name=learner sql="SELECT question_type, accuracy_raw, duration_sec FROM samples WHERE skill_type='reading' ORDER BY created_at DESC LIMIT 20"` | Low accuracy on time-sensitive question types → slow |
| `Study Consistency.streak_days`         | `db name=learner sql="SELECT DISTINCT date(created_at) as d FROM samples ORDER BY d DESC LIMIT 30"` | Count consecutive days with ≥1 sample |
| `Study Consistency.avg_weekly_sessions` | `db name=learner sql="SELECT COUNT(*) as total FROM samples WHERE created_at >= date('now','-28 days')"` | Total sessions ÷ 4 weeks |
| `Active Driver`                         | 7-day samples + errors + MEMORY target   | Set current training direction: focus, modes, support level, watch-errors, next step |

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

1. Query 7-day samples + error stats via `db` tool:
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
   - `Active Driver` — set primary/secondary focus, recommended modes, support level, topic bias, watch-errors, and next step from the biggest current bottleneck plus engagement pattern
   - `Top Errors` — top 3-5 recurrence_keys from week
   - `Study Consistency` — streak_days + avg_weekly_sessions
4. Send weekly report to learner:

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
🎯 当前驱动=report_focus | 📊 详细数据=report_detail | 🏠 返回=menu
]
```

5. `tg(type:"pin")` the weekly report message.

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
   - Refresh `Active Driver.next_step` if the assessment reveals a clear immediate bottleneck
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
📊 详细分析=report_detail | 🎯 当前驱动=report_focus | 🎯 开始练习=menu
]
```

6. Record samples via `db` tool (see `database` skill for queries)

### Detailed Report (report_detail)

When user taps "详细数据":

- Show per-skill breakdown with sub-scores
- Top 5 errors with examples and recurrence count
- Mode distribution chart (text-based)
- Difficulty feedback summary
- Vocabulary growth stats (total words, transfer level distribution)

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
  - short reason
- Keep it short and actionable, not like a weekly timetable

## Rules

1. **Light is silent.** Never message at 22:00.
2. **Deep produces a report.** Always send the weekly report, refresh `Active Driver`, and pin.
3. **On-demand is interactive.** Bilingual, immediate feedback after each skill.
4. **EMA smoothing** for band updates — one bad session won't tank the score.
5. **redo_count=0 samples weighted at 0.7×** — sessions without redo are less reliable.
6. **Assessment never writes to learner.db directly outside of the `db` tool.** Use parameterized queries.
7. **No weekly plan generation.** The system is driven by MEMORY's `Active Driver`, not a weekly timetable.
8. **All errors use taxonomy keys** from `references/error_taxonomy.md`.
9. **Only update fields you have data for.** If a field can't be derived from today's samples, leave it unchanged.
10. **Trend arrows**: ↑ (improved ≥0.5), → (stable), ↓ (declined ≥0.5).
