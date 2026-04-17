# Phase: Full Task (regular training)

## S3 — Send Prompt

If Task 2:

```
tg(type:"force_reply", text:"✍️ **Writing Task 2**\n\n<prompt text>\n\n⏱ 目标：250+ 词\n💡 挑战词汇：<injected words>")
```

If Task 1 — first select chart type:

```
[KEYBOARD:
📊 柱状图=writing:bar | 📈 折线图=writing:line | 🥧 饼图=writing:pie
🗺️ 地图=writing:map | 🔄 流程图=writing:process
]
```

Then generate the chart description (or `tg(type:"photo")` if image available):

```
tg(type:"force_reply", text:"✍️ **Writing Task 1**\n\n<chart description>\n\n⏱ 目标：150+ 词\n💡 图表高频词：fluctuate, peak, plateau, account for, respectively")
```

## S4-S5 — Wait for Response

Learner writes and submits. Accept the text, then proceed to the shared S6+ in the main SKILL.md.

## Topic Selection

- **Task 2**: Push beyond comfort zone. Vary: environment, education, health, society.
- **Task 1**: Vary chart types. Don't repeat consecutively.
