# User Profile Template

Goal: collect only the minimum useful learner profile before starting practice.

## Must Fill

- `Identity.Name`
- `Goals.English target`
- `Goals.Use case`
- `Goals.Timeline`
- `Preferences.Study pattern`
- `Preferences.Tone`
- `Identity.Profession`
- `Identity.Hobbies`
- `Content Profile.engage`
- `Content Profile.daily_english`
- `Background.current_level_estimate`
- `Background.english_strength`
- `Background.english_weakness`

Do not ask for:

- any assistant naming/persona preference

Leave these as `(not set)` unless the learner mentions them naturally:

- `Content Profile.avoid`

## Asking Order

Ask in this order, one turn at a time. If one reply contains multiple fields, extract all of them and skip the overlapping later questions.

### 1. Name

```bash
[native] adapter.force-reply --text "先告诉我，怎么称呼你？ 👇"
```

Write `Identity.Name`.

### 2. Goal Bundle

Ask these three close together because they define path and urgency:

1. target level → `Goals.English target`
2. use case → `Goals.Use case`
3. timeline → `Goals.Timeline`

Suggested prompts:

```text
你希望把英语练到什么程度？如果你心里有雅思目标，也可以直接说分数。
[🗣️ 日常交流更顺] [💼 工作/学习能用] [🌍 表达更自然] [🎯 雅思 6.5+] [🎯 雅思 7.0+]
```

```text
你主要是为了什么来练英语？（也可以直接发消息）
[🌍 移民] [📚 留学] [💼 职业发展] [🏫 国内升学] [🌱 真实提升]
```

```text
你希望多久看到明显进步？如果没定，也可以直接说～
[⚡ 3个月内] [📅 半年内] [🗓️ 一年内] [🌊 先学着再说]
```

Map `先学着再说` → `no target date, learning at own pace`.

### 3. Study Preference Bundle

Ask these next because they affect pacing and style:

1. study pattern → `Preferences.Study pattern`
2. preferred tone → `Preferences.Tone`

Suggested prompts:

```text
你平时更习惯怎么学？（也可以直接发消息）
[⚡ 碎片时间刷题] [📅 每天固定学一段] [🌊 有空再学]
```

```text
我平时跟你说话，想要哪种感觉？也可以直接描述～
[🎯 直接一点] [😊 轻松一点] [⚖️ 平衡一点]
```

`Preferences.Tone` only controls reply style. It is not agent customization.

### 4. Background Bundle

Ask these to improve topic selection and task personalization:

1. profession → `Identity.Profession`
2. hobbies/interests → `Identity.Hobbies`
3. engage topics → `Content Profile.engage`

Suggested prompts:

```text
你现在是工作还是学习？做什么方向呀～
[🎓 学生] [💻 软件工程师] [📐 设计师] [📊 产品经理]
[🏥 医疗] [🏫 教师] [💼 金融] [🏗️ 其他]
```

```text
平时有什么喜欢做的事吗？我后面会尽量拿你更感兴趣的话题来练 😄
[🎮 游戏] [🤖 AI/科技] [💻 编程] [🎬 影视]
[📚 读书] [🏃 运动] [🎵 音乐] [✈️ 旅行] [🍳 美食]
```

Use the hobbies answer to fill both `Identity.Hobbies` and `Content Profile.engage` unless the learner explicitly separates them.

### 5. English Context Bundle

Ask these last, right before calibration:

1. daily exposure → `Content Profile.daily_english`
2. current level estimate → `Background.current_level_estimate`
3. strength/weakness → `Background.english_strength`, `Background.english_weakness`

Suggested prompts:

```text
你平时会接触英语吗？比如游戏、YouTube、工作文档这些都算～
[🎮 游戏英文] [💻 技术文档] [📺 YouTube] [📰 英文新闻]
[🎙️ 播客] [💬 工作英语] [❌ 基本没有]
```

```text
你觉得自己现在大概在哪个阶段？如果你有最近的雅思分数，也可以直接说。
[🔴 基础比较弱] [🟠 能简单交流] [🟡 能表达观点但不稳定] [🟢 比较流利]
```

```bash
[native] adapter.force-reply --text "你觉得自己英语哪里还行，哪里最弱？随便说说就行 👇"
```

## Write Rule

After the questions are done, write `USER.md` via the `memory` tool:

- set `Status.initialized: true`
- fill collected fields
- keep uncollected optional fields as `(not set)`

## Style Rule

- Keep every question short.
- One question per turn.
- Buttons are shortcuts, not mandatory.
- Do not turn init into a long form.
