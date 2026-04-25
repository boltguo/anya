# Profile Fields + Question Bundles

## Required fields (must be set before onboarding completes)

Fields are collected in USER.md section order:

| USER.md Section | Field | Bundle |
| --------------- | ----- | ------ |
| Identity | Name | 1 |
| Identity | Profession | 2 |
| Identity | Hobbies | 2 |
| Goals | English target | 3 |
| Goals | Use case | 3 |
| Goals | Timeline | 3 |
| Goals | exam_date (if IELTS) | 3 |
| Content Profile | engage | 2 (from Hobbies) |
| Content Profile | daily_english | 4 |
| Background | current_level_estimate | 5 |
| Background | english_strength | 5 |
| Background | english_weakness | 5 |
| Preferences | Tone | 6 |
| Preferences | Study pattern | 6 |

Optional (only if volunteered): `Content Profile.avoid`.

## Interaction rules

- **One question per turn.** Send one `tg(keyboard)` or `tg(force_reply)`, then stop and wait.
- Keyboards are shortcuts. The user can always type free text instead — hint this in the question text where appropriate.
- For open-ended questions (hobbies, daily_english), use `force_reply` to let the user type freely.

---

## Bundle 1 — Name

```
tg(type:"force_reply", text:"先告诉我，怎么称呼你？ 👇")
```

Write `Identity.Name`.

## Bundle 2 — Profession + Hobbies

```
tg(type:"keyboard", text:"你现在是做什么的？没有合适的直接打字告诉我也行 👇",
  buttons:"[
    [\"🎓 学生|prof:student\",\"💻 程序员|prof:swe\"],
    [\"📐 设计师|prof:design\",\"📊 产品经理|prof:pm\"],
    [\"🏥 医疗|prof:medical\",\"🏫 教师|prof:teacher\"],
    [\"💼 金融|prof:finance\",\"📱 运营/市场|prof:marketing\"]
  ]")
```

Then hobbies:

```
tg(type:"keyboard", text:"平时有什么爱好？选一个或者直接打字告诉我，多个也行 👇",
  buttons:"[
    [\"🎮 游戏|hobby:gaming\",\"🤖 AI/科技|hobby:tech\"],
    [\"💻 编程|hobby:coding\",\"🎬 影视|hobby:film\"],
    [\"📚 读书|hobby:books\",\"🏃 运动|hobby:sports\"],
    [\"🎵 音乐|hobby:music\",\"✈️ 旅行|hobby:travel\"],
    [\"🍳 美食|hobby:food\",\"🎨 艺术|hobby:art\"]
  ]")
```

Parse → `Identity.Hobbies` + `Content Profile.engage`.

## Bundle 3 — Goals

```
tg(type:"keyboard", text:"你希望把英语练到什么程度？",
  buttons:"[
    [\"🎯 雅思 6.5+|target:6.5\",\"🎯 雅思 7.0+|target:7.0\"],
    [\"🎯 雅思 7.5+|target:7.5\",\"🎯 雅思 8.0+|target:8.0\"],
    [\"🗣️ 日常交流更顺|target:fluent\"],
    [\"💼 工作/学习能用|target:work\"],
    [\"🌍 表达更自然|target:natural\"]
  ]")
```

```
tg(type:"keyboard", text:"主要是为了什么来练？",
  buttons:"[
    [\"🌍 移民|use:migration\",\"📚 留学|use:study\"],
    [\"💼 职业发展|use:work\",\"🏫 国内考试|use:domestic\"],
    [\"🌱 个人提升|use:growth\"]
  ]")
```

```
tg(type:"keyboard", text:"希望多久看到明显进步？",
  buttons:"[
    [\"⚡ 3 个月内|timeline:3m\"],
    [\"📅 半年内|timeline:6m\"],
    [\"🗓️ 一年内|timeline:12m\"],
    [\"🌊 先学着再说|timeline:open\"]
  ]")
```

If the learner selected an IELTS target, follow up with exam date:

```
tg(type:"force_reply", text:"考试大概定在什么时候？没确定就说「还没定」 👇")
```

Store exam_date as ISO `YYYY-MM-DD`. Accept "还没定" → `(not set)`.

## Bundle 4 — Daily English (Content Profile)

```
tg(type:"keyboard", text:"平时会接触英语吗？选一个或者直接打字，多个也行 👇",
  buttons:"[
    [\"🎮 英文游戏|en:gaming\",\"💻 技术文档|en:docs\"],
    [\"📺 YouTube/B站|en:youtube\",\"📰 英文新闻|en:news\"],
    [\"🎙️ 英文播客|en:podcast\",\"💬 工作会用到|en:work\"],
    [\"📖 英文小说|en:novels\",\"🎧 英文歌|en:music\"],
    [\"❌ 基本没有|en:none\"]
  ]")
```

Parse → `Content Profile.daily_english`.

## Bundle 5 — Background

```
tg(type:"keyboard", text:"自己大概在哪个阶段？有分数也可以直接说 👇",
  buttons:"[
    [\"🔴 基础比较弱|level:weak\"],
    [\"🟠 能简单交流|level:basic\"],
    [\"🟡 能表达观点|level:intermediate\"],
    [\"🟢 比较流利|level:fluent\"]
  ]")
```

If user provides actual IELTS/CET score, parse and store directly.

```
tg(type:"force_reply", text:"哪里还行，哪里最弱？随便说就好 👇")
```

Parse free text into `Background.english_strength` + `Background.english_weakness`.

## Bundle 6 — Preferences

```
tg(type:"keyboard", text:"聊天想要哪种感觉？",
  buttons:"[
    [\"🎯 直接高效|tone:direct\"],
    [\"😊 轻松鼓励|tone:warm\"],
    [\"⚖️ 平衡一点|tone:balanced\"]
  ]")
```

```
tg(type:"keyboard", text:"你平时更习惯怎么学？",
  buttons:"[
    [\"⚡ 碎片时间随时练|pattern:fragments\"],
    [\"📅 每天固定一段|pattern:daily\"],
    [\"🌊 有空再学|pattern:flex\"]
  ]")
```

---

## Transition after all bundles

```
建档完成 ✅
先按你现在的情况来出题，后面会边练边校准。
```

Then chain `placement-quick` automatically.
