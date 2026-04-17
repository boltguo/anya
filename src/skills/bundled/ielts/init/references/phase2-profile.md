# Phase 2 — User Profile

Keep the tone conversational throughout. Each step is one friendly question.
Inline keyboards are shortcuts — always add "(也可以直接发消息)" in natural language.

## Step 2.1 — Learner Name

```bash
[native] adapter.force-reply --text "先告诉我，怎么称呼你？ 👇"
```

Write `Identity.Name`. Use this name from now on in the conversation.

## Step 2.2 — Native Language

If `config.user.native_language` is already set, treat it as prefilled context and skip this step unless the learner corrects it.

```
你的母语是？（也可以直接告诉我）

[🇨🇳 中文]  [🇯🇵 日语]  [🇰🇷 韩语]  [🇪🇸 西班牙语]  [其他]
```

Write `Identity.Native language`.

## Step 2.3 — Profession

> 你现在是工作还是学习？做什么方向呀～
> 直接告诉我，或者点一个：

```
[🎓 学生]  [💻 软件工程师]  [📐 设计师]  [📊 产品经理]
[🏥 医疗]  [🏫 教师]  [💼 金融]  [🏗️ 其他]
```

Write `Identity.Profession`.

## Step 2.4 — Hobbies & Interests

> 平时有什么喜欢做的事吗？游戏、追剧、运动都算的～
> 我会根据这个给你出有意思的题目，不用死啃那些无聊的文章 😄
> 可以点几个，也可以直接说：

```
[🎮 游戏]  [🤖 AI/科技]  [💻 编程]  [🎬 影视]
[📚 读书]  [🏃 运动]  [🎵 音乐]  [✈️ 旅行]  [🍳 美食]
```

Accumulate all taps + any free-text replies.
Write `Identity.Hobbies` and `Content Profile.engage`.

## Step 2.5 — IELTS Target Band

> 你的雅思目标分是多少？

```
[5.5]  [6.0]  [6.5]  [7.0]  [7.5]  [8.0+]
```

Note: learner can also type a score directly.
Write `Goals.IELTS target`.

## Step 2.6 — Use Case

> 考这个分是准备做什么用？

```
[🌍 移民]  [📚 留学]  [💼 职业发展]  [🏫 国内升学]  [📋 备考/提升]
```

Note: learner can type anything not covered by buttons.
Write `Goals.Use case`.

## Step 2.7 — Timeline

> 大概打算什么时候考？（或者还没想好也没关系）

```
[⚡ 3个月内]  [📅 半年内]  [🗓️ 一年内]  [🌊 随便学学]
```

Map: 🌊 随便学学 → `Timeline: no target date, learning at own pace`.

Note: learner can type a specific date or month.
Write `Goals.Timeline`.

## Step 2.8 — Study Pattern

> 你平时学东西比较喜欢怎么学？

```
[⚡ 碎片时间刷题]  [📅 每天固定学一段]  [🌊 随缘，有空就学]
```

Write `Preferences.Study pattern`.

## Step 2.9 — Daily English Exposure

> 你平时会接触英语吗？比如打游戏、看 YouTube、读技术文档这些都算～
> 戳戳符合的，或者直接说：

```
[🎮 游戏英文]  [💻 技术文档]  [📺 YouTube]  [📰 英文新闻]
[🎙️ 播客]  [💬 工作英语]  [❌ 基本没有]
```

Accumulate taps + any free text. Write `Content Profile.daily_english`.

## Step 2.10 — English Strengths & Weaknesses

> 最后问一下，你觉得自己英语哪里还行，哪里最弱？
> 比如"看技术文章没问题，但一开口就脑子空白"这种，随便说说就好：

```bash
[native] adapter.force-reply --text "你的英语强项和弱项？ 👇"
```

Extract:

- `Background.english_strength`
- `Background.english_weakness`

## Phase 3 — Persist Profiles (immediately after Phase 2)

### Write USER.md

Use the `memory` tool with `target="user"` and an explicit `action`:

- Set `Status.initialized: true`
- Write all collected values
- Include preferred agent name / coach style if the learner specified them
- Uncollected optional fields → `(not set)` honestly
