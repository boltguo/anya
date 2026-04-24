# Consistency Rules

Thresholds + verdicts for `analysis-study`. Applied after computing the metrics in `study-metrics.md`.

## Imbalance (single-skill dominance or starvation)

Per skill s ∈ {speaking, listening, reading, writing, vocab}:

| Condition | Flag | Message fragment |
| --------- | ---- | ---------------- |
| `load_pct[s] > 45%` | `🔴 dominant:<s>` | "{{s}} 占了总强度的 {{pct}}%，其他技能被挤压" |
| `load_pct[s] < 10% AND load_pct[s] > 0` | `⚠️ starved:<s>` | "{{s}} 只占 {{pct}}%，长期欠练" |
| `load_pct[s] == 0` | `🔴 zero:<s>` | "最近完全没碰 {{s}}" |
| otherwise | — | — |

Present at most 3 flags in priority order: `zero > dominant > starved`.

## Streak + active rate

| Condition | Verdict | Emoji |
| --------- | ------- | ----- |
| `streak >= 14` | 🔥 长期稳定 | 🔥 |
| `7 <= streak < 14` | ✅ 稳定 | ✅ |
| `3 <= streak < 7` | 🙂 起势 | 🙂 |
| `streak < 3 AND active_rate >= 0.5` | ⚖️ 稳但断断续续 | ⚖️ |
| `streak < 3 AND active_rate < 0.5` | ⚠️ 明显断档 | ⚠️ |
| `streak == 0 AND drought_longest >= 3` | 🔴 中断 | 🔴 |

## Task completion

| Condition | Verdict |
| --------- | ------- |
| `task_planned == 0` | 未设定每日任务 — 不做判断 |
| `task_rate >= 0.8` | ✅ 执行稳 |
| `0.5 <= task_rate < 0.8` | ⚠️ 中等执行 |
| `task_rate < 0.5` | 🔴 计划脱节 |

## Behaviour pattern tag

Using metrics from `study-metrics.md`:

- `sprinter` — `active_rate < 0.5 AND avg_load_per_active_day > 4`
- `marathoner` — `active_rate >= 0.6 AND avg_load_per_active_day between 1.5 and 3.5`
- `drifter` — `active_rate < 0.5 AND avg_load_per_active_day < 2`
- `over-loaded` — `avg_load_per_active_day > 6` for 3+ days in a row
- `balanced` — default when none above

Tags are a tie-breaker for `analysis-recommend`; never show multiple tags at once.

## Re-entry thresholds (feed analysis-recommend)

| Signal | Recommendation category |
| ------ | ----------------------- |
| `drought_longest >= 7` | Soft re-entry (low-load task, celebrate return) |
| `imbalance: zero:<s>` in core tracks | Targeted session on the zero skill |
| `over-loaded` | Suggest a lighter session (`speaking-freetalk` / `listening-shadowing` warm-up) |
| `task_rate < 0.5 AND active_rate >= 0.5` | Re-align plan with reality via `coach-passive` |
| `streak >= 14 AND imbalance == balanced` | Raise difficulty one notch OR schedule a full mock |

These don't fire here — `analysis-recommend` reads them.

## Privacy / tone

- No shaming on droughts. "最近断档 {{n}} 天" not "你又不学了".
- Celebrate streaks explicitly at milestones (7 / 14 / 30 / 60 / 90 / 180).
- Honour `Preferences.Tone` (direct / warm / balanced) for framing of flags.
