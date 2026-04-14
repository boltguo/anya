---
name: assessment
description: "IELTS eval: 3 modes — daily cron / weekly cron / on-demand"
version: "1.1.0"
metadatahermes:
  tags: [ielts, assessment, evaluation, band]
  category: anya
---

# Assessment Engine

## When to Use

- **Light**: cron 22:00 daily
- **Deep**: cron Sunday 20:00
- **On-demand**: `practice:assessment` callback from learner
- Never from individual training sessions (that's `data`'s job)

## Resources

- **Report templates**: `./assessment/templates/report.md`
- **Error taxonomy**: `./assessment/references/error_taxonomy.md`

## MEMORY Field Derivation

How each MEMORY.md field is computed from learner.db:

| MEMORY Field | Source query | Derivation logic |
|---|---|---|
| `IELTS Bands` | `list-samples --since 7d` | EMA α=0.3 on per-skill band scores |
| `Top Errors` | `list-errors --limit 20` | Top N by count, must use taxonomy key |
| `Weak Dimensions` | `list-errors --category grammar,lexical` | Map recurrence_keys → IELTS sub-criterion |
| `Vocabulary.cefr` | `list-samples` writing/speaking text | Estimate from avg word complexity in output |
| `Vocabulary.weak_domains` | `list-errors --category lexical` | Cluster word_choice/word_form errors by topic |
| `Grammar Profile.mastered` | `list-samples` | Structures used correctly in ≥3 samples, no errors |
| `Grammar Profile.weak` | `list-errors --category grammar` | Structures with recurrence_key hits ≥2 |
| `Speaking Profile.fluency` | `list-samples --skill speaking` | Coherence sub-score: <4=hesitant, 4-5=moderate, >5=fluent |
| `Speaking Profile.pronunciation_weak` | `list-errors --skill speaking` | Errors tagged with pronunciation recurrence_key |
| `Reading Profile.pace` | `list-samples --skill reading` | Low accuracy on time-sensitive question types → slow |
| `Study Consistency.streak_days` | `list-samples` | Count consecutive days with ≥1 sample |
| `Study Consistency.avg_weekly_sessions` | `list-samples --since 28d` | Total sessions ÷ 4 weeks |

## Protocol

### Light Evaluation (Daily 22:00)

Silent background update. No message to learner.

1. Query today's samples: `tracker_db.py list-samples --since today --limit 50`
2. If no samples → update `streak_days: 0`, skip all other fields
3. Compute from today's data:
   - EMA-smoothed band per skill (α=0.3)
   - Top 3 error recurrence_keys
   - Weak Dimensions (dominant IELTS sub-criteria in errors)
   - `streak_days` (consecutive days with samples)
4. Update MEMORY.md: `IELTS Bands`, `Top Errors`, `Weak Dimensions`, `Study Consistency`

### Deep Evaluation (Sunday 20:00)

Full weekly analysis. Produces a visible report.

1. Query 7-day samples + error stats: `list-samples --since 7d`, `list-errors --since 7d --limit 50`
2. Analyze: rolling bands, improvement/stagnation, new weaknesses
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
5. Send weekly report to learner (template in `templates/report.md`)

### On-Demand Assessment (User-Initiated)

Interactive level check. ~10-15 minutes.

1. Greet (template in `templates/report.md`)
2. Four mini-tasks in sequence:
   - Writing (3-5 min): short Task 2, 80-100 words, 4D band
   - Reading (3 min): ~150-word passage + 3 questions
   - Listening (2 min): short TTS audio + 2 questions
   - Speaking (2 min): Part 1, 3 questions, voice or text
3. Compile: query band-history for comparison
4. Update MEMORY.md: `IELTS Bands`, `Weak Dimensions`, `Speaking Profile.fluency`, `Study Consistency`
5. Present report with inline keyboard (template in `templates/report.md`)
6. Record samples via `data`

## Rules

1. **Light is silent.** Never message at 22:00.
2. **Deep produces a report.** Always send the weekly report + trigger planner.
3. **On-demand is interactive.** Bilingual, immediate feedback after each skill.
4. **EMA smoothing** for band updates — one bad session won't tank the score.
5. **Assessment never writes to learner.db directly.** Writes go through `data`.
6. **On-demand doesn't trigger planner.** That's only for deep eval.
7. **All errors use taxonomy keys** from `references/error_taxonomy.md`.
8. **Only update fields you have data for.** If a field can't be derived from today's samples, leave it unchanged.
