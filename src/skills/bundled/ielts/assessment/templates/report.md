# Assessment Message Templates

## Weekly Report (Deep Eval)

```
📊 **本周学习报告** — {{week_range}}

| 技能 | 上周 | 本周 | 趋势 | 练习次数 |
|---|---|---|---|---|
| ✍️ Writing | {{w_last}} | {{w_now}} | {{w_trend}} | {{w_count}} |
| 🗣️ Speaking | {{s_last}} | {{s_now}} | {{s_trend}} | {{s_count}} |
| 📖 Reading | {{r_last}} | {{r_now}} | {{r_trend}} | {{r_count}} |
| 🎧 Listening | {{l_last}} | {{l_now}} | {{l_trend}} | {{l_count}} |

本周完成 {{total_sessions}} 次练习，连续打卡 {{streak}} 天
🔄 重做完成率: {{redo_rate}}%

📈 **最大进步**: {{biggest_improvement}}
⚠️ **持续弱项**: {{persistent_weakness}}

🎯 **Top Errors This Week**
1. {{error_1}} ({{cat_1}}) — {{count_1}} 次
2. {{error_2}} ({{cat_2}}) — {{count_2}} 次
3. {{error_3}} ({{cat_3}}) — {{count_3}} 次

[KEYBOARD:
📋 下周计划=report_plan | 📊 详细数据=report_detail | 🏠 返回=menu
]
```

Trend values: ↑ (improved ≥0.5), → (stable), ↓ (declined ≥0.5)

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

💪 优势: {{strengths}}
⚠️ 薄弱点: {{weaknesses}}

[KEYBOARD:
📊 详细分析=report_detail | 📋 学习计划=report_plan | 🎯 开始练习=menu
]
```

### Detailed Report (report_detail)

```
📊 **详细分析**

**Writing** ({{w_band}})
- Task Response: {{w_tr}} | Coherence: {{w_cc}}
- Lexical: {{w_lr}} | Grammar: {{w_gra}}
- Top errors: {{w_errors}}

**Speaking** ({{s_band}})
- Fluency: {{s_fc}} | Pronunciation: {{s_pron}}
- Lexical: {{s_lr}} | Grammar: {{s_gra}}
- Top errors: {{s_errors}}

**Reading** ({{r_band}})
- Accuracy: {{r_acc}}% | Speed: {{r_speed}}
- Weak question types: {{r_weak_types}}

**Listening** ({{l_band}})
- Accuracy: {{l_acc}}% | Error causes: {{l_causes}}
- Weak modes: {{l_weak_modes}}

📚 **Vocabulary**
- Total words: {{vocab_total}} | This week: +{{vocab_new}}
- L1: {{l1_count}} | L2: {{l2_count}} | L3: {{l3_count}} | L4: {{l4_count}}

[KEYBOARD:
📋 学习计划=report_plan | 🎯 开始练习=menu
]
```
