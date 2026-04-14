# Assessment Message Templates

## Weekly Report

```
📊 **Weekly Report — Week of {{week_start}}**

| Skill | Band | Trend | Sessions |
|---|---|---|---|
| ✍️ Writing | {{w_band}} | {{w_trend}} | {{w_count}} |
| 🗣️ Speaking | {{s_band}} | {{s_trend}} | {{s_count}} |
| 📖 Reading | {{r_band}} | {{r_trend}} | {{r_count}} |
| 👂 Listening | {{l_band}} | {{l_trend}} | {{l_count}} |

🎯 **Top Errors This Week**
1. {{error_1}} ({{cat_1}}) — {{count_1}} occurrences
2. {{error_2}} ({{cat_2}}) — {{count_2}} occurrences

📋 **Next Week Focus**: {{plan_focus}}
```

## On-Demand Assessment

### Greet
```
📋 水平测评
Level Assessment

I'll test you across 4 skills in about 10-15 minutes.
我会用 10-15 分钟测试你的四项能力。

Let's go! 💪
```

### Report
```
📋 **Assessment Complete!**
📋 **测评完成！**

| Skill | Band | vs Last |
|---|---|---|
| ✍️ Writing | {{w_band}} | {{w_delta}} |
| 🗣️ Speaking | {{s_band}} | {{s_delta}} |
| 📖 Reading | {{r_band}} | {{r_delta}} |
| 👂 Listening | {{l_band}} | {{l_delta}} |
| **Overall** | **{{overall}}** | |

💪 Strengths: {{strengths}}
💪 优势：{{strengths_cn}}

⚠️ Focus areas: {{weaknesses}}
⚠️ 薄弱点：{{weaknesses_cn}}

[📋 查看详细分析|assess:detail]  [🎯 开始练习|next_exercise]
```
