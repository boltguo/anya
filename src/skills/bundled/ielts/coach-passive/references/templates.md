# Coach Passive — Reply Templates

One template per question class. Every reply ends with exactly one action button.

## Diagnosis ("why dropped / 哪里最弱")

```
你最近 14 天的数据我看了下：

- {{weakest_dim}} 是瓶颈（最近 {{n}} 次均值 {{avg_band}}）
- 常错模式：{{top_error_1}}、{{top_error_2}}
- 根因倾向：{{root_cause}}（语言 / 认知 / 策略）

最有性价比的一步：{{action}}
```

`[🎯 现在就做|{{callback}}]  [再看一个建议|coach-passive]  [🏠 主菜单|nav:main]`

## Plan ("下一步 / 这周")

```
接下来 {{horizon_days}} 天建议：

1. 主攻：{{primary_skill}} / {{primary_mode}}（每次 ~{{primary_time}}，预期 +{{primary_gain}}）
2. 辅助：{{support_skill}} / {{support_mode}}（隔天一次）

锁定指标：{{metric}} → {{metric_target}}
```

`[🎯 先做主攻|{{primary_callback}}]  [做辅助|{{support_callback}}]  [🏠 主菜单|nav:main]`

## How-to ("这个错怎么改")

```
这类错属于 {{category}} - {{subkey}}。

原因多半是 {{root_cause_explanation}}。

建议：
- 立刻改：{{immediate_fix}}
- 练一次：{{drill_recommendation}}
```

`[开始练|{{drill_callback}}]  [先看更多例子|coach-passive]`

## Why ("为什么 X 有帮助 / 为什么不练 Y")

One-paragraph reasoning tying to pedagogy foundation + learner state. End with:

`[🎯 {{suggested_action_label}}|{{callback}}]  [🏠 主菜单|nav:main]`

## Tone presets (from Preferences.Tone)

- `direct` — "该练 {{x}}"
- `warm` — "最划算的一步是 {{x}}，试试看"
- `balanced` (default) — "数据看下来，{{x}} 的性价比最高"
