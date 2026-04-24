# Recommendation Rules

Strict-priority decision tree for `analysis-recommend`. Exactly one rule fires per invocation.

## Inputs

Pulled by the skill before this rule-set runs:

- `current_overall`, `target_overall`, `gap`
- `days_to_exam` (may be `null`)
- `weekest_skill`, `bottleneck_1`, `bottleneck_2` (from `analysis-weakness`)
- `study_health`, `streak`, `drought_longest`, `imbalance_flags`, `pattern_tag` (from `analysis-study`)
- `exam_trend[skill]`, `stability_verdict[skill]` (from `analysis-exam` if available)

## Priority-ordered rules

Evaluate rules top-to-bottom; the first that matches wins.

### Rule 1 — `exam_close`

**Match**: `days_to_exam IS NOT NULL AND days_to_exam <= 14`

**Action pattern**:

| Sub-case | Now | Today | Week |
| -------- | --- | ----- | ---- |
| `days <= 3` | stabilise strongest skill with `{{strongest}}-exam` short drill | no new drills — revise notes | light ext input |
| `4 <= days <= 7` | full mock of the weakest skill (`{{weakest}}-exam`) | `{{weakest}}-explain` on the mock | 1 more mock in the other weak skill |
| `8 <= days <= 14` | `{{weakest}}-exam` | bottleneck-1 drill | 2 mocks (alternating skills) + daily vocab-review |

**Evidence line**: `距离考试 {{days_to_exam}} 天 — 已切换成冲刺模式`.

### Rule 2 — `acute_drift`

**Match**: any `exam_trend[skill].band_delta_avg3 <= -0.5` AND not exam_close.

**Action**: drive to `bottleneck_1` tied to the drifting skill. If `bottleneck_1` is not in the drifting skill, override with the highest-ranked subcap in that skill via `next-step-map.md`.

**Evidence line**: `{{skill}} 近 3 次均值 {{avg3}} → 本次 {{now}}，落 {{delta}}`.

### Rule 3 — `chronic_bottleneck`

**Match**: `bottleneck_1.persistence == 'chronic'` AND not exam_close AND not acute_drift.

**Action**: launch the skill from `next-step-map.md` for `bottleneck_1`. If chronic spans 2+ skills, pick the one with higher `severity * frequency`.

**Evidence line**: `{{recurrence_key}} 已经连续出现 {{window}} 天 / {{count}} 次`.

### Rule 4 — `imbalance_zero`

**Match**: `imbalance_flags` contains `zero:<skill>` AND not any of rules 1–3.

**Action**: most basic drill for the unfed skill (lowest load_score option). Example:

| Zero skill | Go-to drill |
| ---------- | ----------- |
| speaking | `speaking-freetalk` |
| listening | `listening-dictation` |
| reading | `reading-untimed` |
| writing | `writing-guided` (if band < 5.5) else `writing-sentence-drill` |
| vocab | `vocab-review` |

**Evidence line**: `最近 {{window}} 天完全没碰 {{skill}}`.

### Rule 5 — `over_loaded`

**Match**: `pattern_tag == 'over-loaded'` for ≥ 3 days.

**Action**: suggest a light session:

- `listening-shadowing` warm-up
- `speaking-freetalk` 90 sec
- `vocab-review` small batch (cap 5)

Frame as recovery, not guilt.

**Evidence line**: `近 {{n}} 天每天负荷 {{load}}，先来段轻的`.

### Rule 6 — `re_entry`

**Match**: `drought_longest >= 3 AND streak == 0` AND not exam_close.

**Action**: lowest-friction task:

- `vocab-review` (5 items)
- `listening-shadowing` (60 sec clip)
- `speaking-freetalk` (90 sec)

Copy tone: "先做一点就好 — 回来比坚持重要".

**Evidence line**: `{{drought_longest}} 天没来，先回来做一点`.

### Rule 7 — `progression`

**Match**: None of the above AND `study_health >= 70 AND streak >= 7 AND stability_verdict[weakest_skill] == 'stable'`.

**Action**: raise difficulty OR schedule a full mock.

- If no mock in last 14 days → `{{weakest_skill}}-exam`.
- Else → raise difficulty on `{{weakest_skill}}`'s main drill (choose the harder variant from `next-step-map.md`).

**Evidence line**: `最近稳 — 是时候推一档`.

### Rule 8 — `default_maintenance`

**Match**: fallthrough.

**Action**: the drill for `bottleneck_1` via `next-step-map.md`. If no bottleneck data, suggest `vocab-review` + `listening-dictation`.

**Evidence line**: `基于近期数据的一个稳妥选择`.

## Output shape: minimal vs structured

- **Minimal**: one action, one button. This is the default.
- **Structured**: three-tier now/today/week. Use when the learner explicitly asked `帮我规划 / plan my week / 3 件事` OR when `exam_close` fires (exam mode always uses structured).

## Metric-lock suggestion

When picking `metric` for the structured form:

- If bottleneck is subcap — lock that subcap's avg score with target `+0.5`.
- If bottleneck is error family — lock `error_count_per_week` with target halved.
- If exam_close — lock `days_active / remaining_days` at `100%`.

## Dedupe

Before returning, check the last `samples WHERE skill_type='analysis_recommend'` row within the last hour. If same `rule_fired AND same bottleneck`, return the same action (the learner may have come back from the action; continuity beats novelty).

## Tone presets

- `direct` — "该练 {{x}}".
- `warm` — "最划算的一步是 {{x}}，试试看".
- `balanced` (default) — "数据看下来，{{x}} 的性价比最高".
