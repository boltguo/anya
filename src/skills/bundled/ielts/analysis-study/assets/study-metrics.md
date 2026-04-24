# Study-Behaviour Metrics

Metric definitions for `analysis-study`. Reads `samples` + `daily_tasks`; never reads bands or errors.

## Window parameters

- `window_days` — default 14; accept 7 / 14 / 30.
- `today` — local date.

## Session counts

| Key | Definition |
| --- | ---------- |
| `total_sessions` | `COUNT(*)` of `samples` in window |
| `total_load` | `SUM(load_score)` of `samples` in window |
| `session_by_skill[skill]` | count per skill_type (speaking/listening/reading/writing/vocab/daily_briefing) |
| `load_by_skill[skill]` | summed load_score per skill |

## Coverage + balance

- `coverage_pct_by_skill[skill] = load_by_skill[skill] / total_load`
- Imbalance flag rules:
  - `dominant` if any single skill > 45% of load
  - `starved` if any of the 5 tracks < 10% of load
  - `zero` if any of the 5 tracks == 0% of load (not touched at all)

## Active days + streak

- `active_days` — `COUNT(DISTINCT date(created_at))` in window
- `active_rate = active_days / window_days`
- `streak_days` — consecutive days ending today with ≥ 1 session
- `longest_streak_in_window` — max consecutive run inside window
- `drought_longest` — max consecutive zero days inside window (counts gaps)

Streak recomputation:

```
def streak(days: list[date], today: date) -> int:
    d = today
    n = 0
    while d in days:
        n += 1
        d -= 1
    return n
```

## Task adherence

- `task_planned` — `COUNT(*) FROM daily_tasks WHERE date IN window`
- `task_done` — `SUM(completed)` in same scope
- `task_rate = task_done / task_planned` (null-safe: 0 planned → report `task_rate = null`)

## Load intensity

- `avg_load_per_active_day = total_load / active_days`
- `avg_sessions_per_active_day = total_sessions / active_days`
- Tag the learner's pattern:
  - `sprinter` — high load, low active_rate (batches many sessions into few days)
  - `marathoner` — medium load, high active_rate (spreads over many days)
  - `drifter` — low load, low active_rate (falling off)

## Derived health score (internal; not shown)

`study_health ∈ [0, 100]` =
  `40 * active_rate + 30 * (1 - imbalance_severity) + 20 * task_rate + 10 * min(streak/14, 1)`

Used internally by `analysis-recommend` to pick re-entry vs push recommendations. Not shown to the learner unless they ask.

## Output rounding

- Percentages: round to whole numbers for display.
- Counts: integers.
- Load: round to 1 decimal.
- Rates: `NaN / 0 → null`, render as `—` in UI.
