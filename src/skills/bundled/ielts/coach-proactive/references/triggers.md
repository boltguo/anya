# Trigger Catalogue + Messages

One trigger fires per pass. Priority order (top wins):

1. `exam_close`
2. `band_drop`
3. `error_cluster`
4. `streak_break`
5. `subcap_trough`
6. `streak_milestone`
7. `band_rise`
8. `plan_refresh_due`

## Detection signals

| Trigger | Signal |
| ------- | ------ |
| `exam_close` | `Goals.exam_date` ≤ 14 days away |
| `band_drop` | `learner-state` smoothed a skill band down ≥ 0.5 |
| `band_rise` | smoothed skill band up ≥ 0.5 |
| `error_cluster` | same `recurrence_key` ≥ 4 times in last 7 days |
| `subcap_trough` | subcap avg ≤ 4.5 with n ≥ 3 |
| `streak_break` | `streak_days` dropped from ≥ 5 to 0 |
| `streak_milestone` | `streak_days` ∈ {7, 14, 30, 60, 90, 180} |
| `vocab_queue_empty` | `queued_new_count = 0` → stay silent |
| `plan_refresh_due` | 7 days since last proactive plan push |

## Messages

### streak_break

```
看你这两天没过来练，没关系，先回来做一个轻量的就好。
```
`[🔊 3 分钟泛听|listening-shadowing]  [🏠 主菜单|nav:main]`

### band_drop

```
最近 {{skill}} 平均分从 {{prev}} 微降到 {{now}}。
主要卡在 {{top_subcap}}（{{evidence}}）。
要不要来一轮针对性练习？
```
`[针对 {{top_subcap}} 练一次|{{callback}}]`

### error_cluster

```
最近 7 天出现了 {{n}} 次 {{recurrence_key}}。
根因多半是 {{root_cause}}。
有 1 次讲解 + 1 次短练习就能压下来。
```
`[讲解上次错题|{{explain_callback}}]`

### exam_close

```
距离考试还有 {{days}} 天。
建议接下来轮换改成：精练题型 + 稳住强项。
```
`[看 2 周冲刺计划|plan_refresh]`

### streak_milestone

```
🎉 连续学习 {{days}} 天。
要不要来一次更难的？
```
`[挑战难度|{{harder_callback}}]  [保持节奏|nav:main]`

### band_rise

```
{{skill}} 平均分从 {{prev}} 升到 {{now}} 🎉。
要不要做一次 {{skill}} 模考看看是否稳住？
```
`[做 {{skill}} 模考|{{skill}}-exam]`

### subcap_trough

```
{{subcap_key}} 最近均值 {{avg}}（n={{n}}），偏弱。
推荐专项：{{drill}}
```
`[开始专项|{{drill_callback}}]`

### plan_refresh

Build a 2-week rotation from weak dims + exam proximity. Present as a short table. Do not write to MEMORY.

## Delivery

- Use `tg(type:"text")` for all pushes.
- Everything else is a plain message.
- Record the push with `skill_type='coach_proactive'`, `prompt=<trigger>`, `load_score=0`.
