# Profile Fields + Question Bundles

## Required fields (must be set before onboarding completes)

| Field | Collected in bundle |
| ----- | ------------------- |
| `Identity.Name` | 1 |
| `Goals.English target` | 2 |
| `Goals.Use case` | 2 |
| `Goals.Timeline` | 2 |
| `Goals.target_band` (if IELTS) | 2 |
| `Goals.exam_date` (if scheduled) | 2 |
| `Goals.weekly_hours` | 3 |
| `Preferences.Study pattern` | 3 |
| `Preferences.Tone` | 3 |
| `Identity.Profession` | 4 |
| `Identity.Hobbies` | 4 |
| `Content Profile.engage` | 4 |
| `Content Profile.daily_english` | 5 |
| `Background.current_level_estimate` | 5 |
| `Background.english_strength` | 5 |
| `Background.english_weakness` | 5 |

Optional (only if volunteered): `Content Profile.avoid`.

## Bundle 1 — Name

```
tg(type:"force_reply", text:"先告诉我，怎么称呼你？ 👇")
```

Write `Identity.Name`.

## Bundle 2 — Goal

Three close-together questions:

```
tg(type:"keyboard", text:"你希望把英语练到什么程度？", buttons:"[[\"🎯 雅思 6.5+|target:6.5\",\"🎯 雅思 7.0+|target:7.0\"],[\"🗣️ 日常交流更顺|target:fluent\"],[\"💼 工作/学习能用|target:work\"],[\"🌍 表达更自然|target:natural\"]]")
```

```
tg(type:"keyboard", text:"主要是为了什么来练？", buttons:"[[\"🌍 移民|use:migration\",\"📚 留学|use:study\"],[\"💼 职业发展|use:work\",\"🏫 国内升学|use:domestic\"],[\"🌱 真实提升|use:growth\"]]")
```

```
tg(type:"keyboard", text:"希望多久看到明显进步？", buttons:"[[\"⚡ 3 个月内|timeline:3m\"],[\"📅 半年内|timeline:6m\"],[\"🗓️ 一年内|timeline:12m\"],[\"🌊 先学着再说|timeline:open\"]]")
```

If the learner gave an IELTS target, ask for exam date separately and store as ISO.

## Bundle 3 — Preferences

```
tg(type:"keyboard", text:"你平时更习惯怎么学？", buttons:"[[\"⚡ 碎片时间刷题|pattern:fragments\"],[\"📅 每天固定一段|pattern:daily\"],[\"🌊 有空再学|pattern:flex\"]]")
```

```
tg(type:"keyboard", text:"聊天想要哪种感觉？", buttons:"[[\"🎯 直接一点|tone:direct\",\"😊 轻松一点|tone:warm\",\"⚖️ 平衡|tone:balanced\"]]")
```

Also ask weekly_hours: `"每周大概能抽出多久练英语？"` — accept numeric or vague ("3-5 小时").

## Bundle 4 — Background + interests

```
tg(type:"keyboard", text:"现在是工作还是学习？做什么方向？", buttons:"[[\"🎓 学生|prof:student\",\"💻 软件工程师|prof:swe\"],[\"📐 设计|prof:design\",\"📊 产品|prof:pm\"],[\"🏥 医疗|prof:medical\",\"🏫 教师|prof:teacher\"],[\"💼 金融|prof:finance\",\"🏗️ 其他|prof:other\"]]")
```

```
tg(type:"keyboard", text:"平时有什么喜欢做的事？", buttons:"[[\"🎮 游戏|hobby:gaming\",\"🤖 AI/科技|hobby:tech\"],[\"💻 编程|hobby:coding\",\"🎬 影视|hobby:film\"],[\"📚 读书|hobby:books\",\"🏃 运动|hobby:sports\"],[\"🎵 音乐|hobby:music\",\"✈️ 旅行|hobby:travel\"],[\"🍳 美食|hobby:food\"]]")
```

Use hobby answers for both `Identity.Hobbies` and `Content Profile.engage` unless separated.

## Bundle 5 — English context

```
tg(type:"keyboard", text:"平时会接触英语吗？", buttons:"[[\"🎮 游戏英文|en:gaming\",\"💻 技术文档|en:docs\"],[\"📺 YouTube|en:youtube\",\"📰 英文新闻|en:news\"],[\"🎙️ 播客|en:podcast\",\"💬 工作|en:work\"],[\"❌ 基本没有|en:none\"]]")
```

```
tg(type:"keyboard", text:"自己大概在哪个阶段？有雅思分也可以直接说。", buttons:"[[\"🔴 基础比较弱|level:weak\"],[\"🟠 能简单交流|level:basic\"],[\"🟡 能表达观点|level:intermediate\"],[\"🟢 比较流利|level:fluent\"]]")
```

```
tg(type:"force_reply", text:"哪里还行，哪里最弱？随便说就好 👇")
```

Parse strength/weakness free text into both `Background.english_strength` and `Background.english_weakness`.

## Transition message after Bundle 5

```
设置完成 ✅
先按你现在的情况来出题，后面会边练边校准。
```

Then chain `placement-quick` automatically.
