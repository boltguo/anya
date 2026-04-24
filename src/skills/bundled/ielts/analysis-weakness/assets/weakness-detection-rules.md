# Weakness-Detection Rules

Thresholds + classifications used by `analysis-weakness`. Every rule here is deterministic — the same window + data always produces the same verdicts.

## Window

- `window_days` — default 14, accept 7 / 14 / 30.
- `prev_window_days` — same size, immediately preceding current window. Used for chronic / rising / fading detection.

## Frequency tiers (per recurrence_key in current window)

| Count in window | Tier | Label |
| --------------- | ---- | ----- |
| `c >= 6` | `very_high` | 🔴 高频重复 |
| `4 <= c < 6` | `high` | ⚠️ 明显 |
| `2 <= c < 4` | `moderate` | 🟡 偶发 |
| `c == 1` | `single` | (not shown in the top-5 unless severity=high) |

## Severity (from `errors.severity` field)

Tiers follow the writer's intent: `low / medium / high`. `high` severity items never get demoted out of the top-5 even if `c == 1`.

Composite rank used for Top-5:

`rank_score = severity_weight[sev] × frequency_weight[tier]`

| severity | weight |
| -------- | ------ |
| high | 3 |
| medium | 2 |
| low | 1 |

| tier | weight |
| ---- | ------ |
| very_high | 4 |
| high | 3 |
| moderate | 2 |
| single | 1 |

## Persistence classification

Compare `current_window_count[key]` vs `prev_window_count[key]`:

| Rule | Flag |
| ---- | ---- |
| `prev >= 3 AND current >= 3 AND abs(current - prev) <= max(1, prev * 0.2)` | `chronic` |
| `current >= 3 AND current >= prev + max(2, prev * 0.5)` | `rising` |
| `prev >= 3 AND prev - current >= max(2, prev * 0.5)` | `fading` |
| `prev < 2 AND current >= 3` | `newly_frequent` |
| `prev >= 3 AND current == 0` | `resolved` |

Each `recurrence_key` gets at most one persistence tag.

## Subcap weakness

| Condition | Label |
| --------- | ----- |
| `avg_score <= 4.5 AND n >= 3` | 🔴 严重薄弱 |
| `4.5 < avg_score <= 5.5 AND n >= 3` | ⚠️ 偏弱 |
| `5.5 < avg_score <= 6.5 AND n >= 3` | 🟡 中等 |
| `avg_score > 6.5 AND n >= 3` | ✅ 稳定 |
| `n < 3` | 🕳️ 样本不足 (don't rank into Top-5) |

## Root-cause aggregation

Each `recurrence_key` is tagged `language / cognitive / strategy` in `error-taxonomy.md`. Aggregate the counts weighted by `rank_score`, then normalize to percentages.

Dominant root-cause verdicts:

| Rule | Verdict |
| ---- | ------- |
| `language_pct >= 60%` | 主要问题在 **语言层** — 补词 / 补句型 / 补语法 |
| `cognitive_pct >= 50%` | 主要问题在 **认知层** — 增加 load 下的重复练习 |
| `strategy_pct >= 40%` | 主要问题在 **策略层** — 练做题技巧 / 时间管理 |
| none of the above | 混合 — 同时抓语言 + 认知 |

## Top-5 selection

After computing rank_score:

1. Sort desc by `rank_score`.
2. Drop items flagged `fading` or `resolved` (success, not a worry).
3. Keep at most 5.
4. If after dropping, the list has < 3 items AND there are any `single + medium-severity` candidates, promote the top of those to fill.

## Bottleneck picker (Top-2 drivers)

The Top-5 list is informative; the **bottleneck** is actionable. Pick 2 items that together satisfy:

- Cover ≥ 60% of the rank_score mass.
- Come from different categories (don't duplicate speaking + speaking for a learner with balanced issues).
- Prefer `chronic` over `newly_frequent` when both qualify, because chronic items matter more longitudinally.

Each bottleneck must map to exactly one drill callback via `analysis-recommend/assets/next-step-map.md`.

## Noise filters

- Exclude `mechanics.spelling` from bottleneck selection unless `c >= 6` — spelling isolated slips are noisy.
- Exclude any key with `n < 2` from bottleneck selection.
- If the error count window is empty, short-circuit and report "近 X 天样本不足，无法识别薄弱项" — send back to more practice.

## Presentation tie-ins

- Persistence tag shows as an emoji prefix:
  - chronic → 🔁
  - rising → 📈
  - fading → 📉
  - newly_frequent → 🆕
  - resolved → ✅

These appear next to each item in the Top-5 list.
