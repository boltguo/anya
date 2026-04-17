# Assessment Message Templates

## Weekly Report (Deep Eval)

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

▍ 提分杠杆
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

Stability emoji: ✅ (std ≤ 0.3) / ⚠️ (std 0.3–0.6) / 🔴 (std > 0.6)
Trend values: ↑ (improved ≥ 0.5), → (stable), ↓ (declined ≥ 0.5)

## Stability Tracking Block (appended to Deep report)

```
▍ 稳定性追踪
  近 10 次 writing band: mean {{w_mean}}, std {{w_std}}, trough {{w_trough}}  →  {{w_verdict}}
  近 10 次 speaking band: mean {{s_mean}}, std {{s_std}}, trough {{s_trough}}  →  {{s_verdict}}
  近 10 次 reading band:  mean {{r_mean}}, std {{r_std}}, trough {{r_trough}}  →  {{r_verdict}}
  近 10 次 listening band: mean {{l_mean}}, std {{l_std}}, trough {{l_trough}} →  {{l_verdict}}

  结论: {{stability_conclusion}}
```

Verdicts: ✅ 接近稳态 / ⚠️ 波动偏大 / 🔴 高度不稳定

## Biweekly Deep Dive Report

```
🔬 **双周深挖** — {{primary_skill}} ({{date_range}})

▍ 子能力趋势 (14 天)
  {{subcap_1}}  ▓▓▓▓▓▓░░░░  {{score_1}}  {{trend_1}}
  {{subcap_2}}  ▓▓▓▓▓░░░░░  {{score_2}}  {{trend_2}}
  {{subcap_3}}  ▓▓▓▓░░░░░░  {{score_3}}  {{trend_3}}
  {{subcap_4}}  ▓▓▓░░░░░░░  {{score_4}}  {{trend_4}}

▍ 根因分布
  语言层 {{lang_pct}}% · 认知层 {{cog_pct}}% · 策略层 {{str_pct}}%

▍ 最有效训练模式: {{best_mode}}
▍ 进步最大子能力: {{most_improved}}

[KEYBOARD:
🎯 开始专项训练={{primary_cb}} | 📊 完整报告=assessment
🏠 返回=menu
]
```

## On-Demand Assessment

### Greet

```
📋 **水平测评**

我会用 10-15 分钟测试你的四项能力:
🗣️ Speaking → 🎧 Listening → 📖 Reading → ✍️ Writing

Let's go! 💪
```

### Report

```
📋 **测评完成！**

| 技能 | 当前 | vs 上次 | 置信度 |
|---|---|---|---|
| ✍️ Writing | {{w_band}} | {{w_delta}} | {{w_conf}} |
| 🗣️ Speaking | {{s_band}} | {{s_delta}} | {{s_conf}} |
| 📖 Reading | {{r_band}} | {{r_delta}} | {{r_conf}} |
| 🎧 Listening | {{l_band}} | {{l_delta}} | {{l_conf}} |
| **Overall** | **{{overall}}** | | |

▍ 子能力雷达 (最薄弱 4 项)
  {{sub1_key}}  ▓▓▓▓░░░░░░  {{sub1_score}}
  {{sub2_key}}  ▓▓▓░░░░░░░  {{sub2_score}}
  {{sub3_key}}  ▓▓▓░░░░░░░  {{sub3_score}}
  {{sub4_key}}  ▓▓░░░░░░░░  {{sub4_score}}

💪 优势: {{strengths}}
⚠️ 薄弱点: {{weaknesses}}

[KEYBOARD:
📊 详细分析=report_detail | 🎯 当前驱动=report_focus | 🎯 开始练习=practice
]
```

### Detailed Report (report_detail)

```
📊 **详细分析**

**Writing** ({{w_band}})
- Task Response: {{w_tr}} | Coherence: {{w_cc}}
- Lexical: {{w_lr}} | Grammar: {{w_gra}}
- Subcaps: {{w_subcap_detail}}
- Top errors: {{w_errors}}

**Speaking** ({{s_band}})
- Fluency: {{s_fc}} | Pronunciation: {{s_pron}}
- Lexical: {{s_lr}} | Grammar: {{s_gra}}
- Subcaps: {{s_subcap_detail}}
- Top errors: {{s_errors}}

**Reading** ({{r_band}})
- Accuracy: {{r_acc}}% | Speed: {{r_speed}} wpm
- Subcaps: {{r_subcap_detail}}
- Weak question types: {{r_weak_types}}

**Listening** ({{l_band}})
- Accuracy: {{l_acc}}% | Error causes: {{l_causes}}
- Subcaps: {{l_subcap_detail}}
- Weak modes: {{l_weak_modes}}

📚 **Vocabulary**
- Total words: {{vocab_total}} (word: {{w_ct}} | chunk: {{c_ct}} | pattern: {{p_ct}})
- This week: +{{vocab_new}}
- L1: {{l1_count}} | L2: {{l2_count}} | L3: {{l3_count}} | L4: {{l4_count}}

📝 **Rewrite Chains**
- Active chains: {{chain_count}} | Avg improvement: +{{chain_avg_gain}}

[KEYBOARD:
🎯 当前驱动=report_focus | 🎯 开始练习=practice
]
```

### Current Driver (report_focus)

```
🎯 **当前驱动**

- 主攻: {{driver_primary}}
- 次重点: {{driver_secondary}}
- 推荐模式: {{driver_modes}}
- 支架强度: {{driver_support}}
- 持续盯住: {{driver_errors}}
- 稳定性: {{driver_stability_status}} {{stability_emoji}}
- 下一步: {{driver_next_step}}
- 一键开始: {{driver_next_micro_action}}

原因:
{{driver_reason}}

[KEYBOARD:
🎯 {{micro_action_label}}={{micro_action_cb}} | 📊 详细分析=report_detail
🏠 返回=menu
]
```
