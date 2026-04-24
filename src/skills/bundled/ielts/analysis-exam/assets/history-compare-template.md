# History-Compare Templates

Output templates for `analysis-exam` when there are ≥ 2 exams in scope. All templates are Telegram-HTML safe.

## Template A — 2-exam compare (本次 vs 上次)

```text
📊 考试对比 — {{this_date}} vs {{prev_date}}

| 技能 | 上次 | 本次 | Δ | 趋势 |
|---|---|---|---|---|
| ✍️ 写作 | {{w_prev}} | {{w_now}} | {{w_delta}} | {{w_trend}} |
| 🗣️ 口语 | {{s_prev}} | {{s_now}} | {{s_delta}} | {{s_trend}} |
| 📖 阅读 | {{r_prev}} | {{r_now}} | {{r_delta}} | {{r_trend}} |
| 🎧 听力 | {{l_prev}} | {{l_now}} | {{l_delta}} | {{l_trend}} |
| 📊 Overall | {{o_prev}} | {{o_now}} | {{o_delta}} | {{o_trend}} |

▍ 最大亮点
{{biggest_gain_skill}} +{{biggest_gain_delta}}  ({{biggest_gain_reason}})

▍ 最大回落
{{biggest_loss_skill}} {{biggest_loss_delta}}  ({{biggest_loss_reason}})
```

Trend arrows: ↑ (≥ +0.5), → (stable), ↓ (≥ −0.5).

## Template B — last 3 exams (近 3 次)

```text
📊 近 3 次考试趋势

| 技能 | {{d1}} | {{d2}} | {{d3}} | 均值 | 稳定 |
|---|---|---|---|---|---|
| ✍️ 写作 | {{w1}} | {{w2}} | {{w3}} | {{w_avg}} | {{w_verdict}} |
| 🗣️ 口语 | {{s1}} | {{s2}} | {{s3}} | {{s_avg}} | {{s_verdict}} |
| 📖 阅读 | {{r1}} | {{r2}} | {{r3}} | {{r_avg}} | {{r_verdict}} |
| 🎧 听力 | {{l1}} | {{l2}} | {{l3}} | {{l_avg}} | {{l_verdict}} |

▍ 已接近稳态
{{stable_list}}

▍ 仍波动
{{wavy_list}}

▍ 最稳的子能力
{{top_stable_subcap}}  (std {{std_value}})

▍ 最不稳的子能力
{{least_stable_subcap}}  (std {{std_value}})
```

## Template C — single-exam card

Used when scope = 1 (no comparison possible).

```text
📊 本次考试卡片 — {{exam_kind}} · {{exam_date}}

| 技能 | 估分 |
|---|---|
| 写作 T1 | {{t1}} |
| 写作 T2 | {{t2}} |
| 写作 Overall | {{w_overall}} |
| 口语 | {{speaking}} |
| 阅读 | {{reading}} |
| 听力 | {{listening}} |
| 📊 Overall | {{overall}} |

▍ 子能力 Top 3（最强）
  {{sub_strong_1}} · {{sub_strong_2}} · {{sub_strong_3}}

▍ 子能力 Bottom 3（最弱）
  {{sub_weak_1}} · {{sub_weak_2}} · {{sub_weak_3}}

▍ 题型命中 (阅读 / 听力)
  {{type_accuracy_table}}

▍ 时间管理
  {{time_notes}}
```

## Keyboard (all templates share)

```
[KEYBOARD:
🎯 看下一步建议=analysis-recommend | 🔍 看具体错题={{explain_cb}} | 🏠 主菜单=nav:main
]
```

`{{explain_cb}}` = `speaking-explain` / `listening-explain` / `reading-explain` / `writing-explain`, chosen based on which skill's exam was the most recent in scope.

## Trend-emoji legend

- ↑ Strong improvement (Δ ≥ +0.5)
- ↗ Mild improvement (+0.25 ≤ Δ < +0.5)
- → Stable (|Δ| < 0.25)
- ↘ Mild decline (−0.5 < Δ ≤ −0.25)
- ↓ Strong decline (Δ ≤ −0.5)

## Verdict legend

- ✅ 接近稳态 (`band_std ≤ 0.3` AND `trough_7d ≥ overall − 0.5`)
- ⚠️ 波动偏大 (`band_std ≤ 0.6`)
- 🔴 高度不稳定 (`band_std > 0.6`)
