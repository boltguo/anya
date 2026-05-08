---
name: profile-manager
description: "Build or update the learner's USER.md profile; also the /profile-manager command and first-run onboarding dispatcher."
---

# Profile Manager

Owner of `USER.md`. Builds or corrects a short natural-language user profile. On first-run (or `/profile-manager`), also dispatches the full onboarding: profile → `placement-quick` → `planner`.

## When to Use

- `/profile-manager` command
- `USER.md` still contains `initialized: false`
- `建档 / 重新建档 / 改目标 / update profile / 我换工作了`
- Another skill needs profile context that is still missing
- `我的 USER 里是什么 / show my profile`

## Workflow

0. **Bootstrap study.db** — call `persist` with `{"action":"coach_context","days":1,"limit":3}` to ensure the database and schema exist.
1. Read `USER.md` + `MEMORY.md`.
2. Decide mode:
   - **First-run** (`initialized: false` or `/profile-manager` with an empty profile): Execute the **4-Step Onboarding Flow** below.
   - **Targeted update**: Parse intent, ask at most one clarifying question, then rewrite the relevant natural-language section in `USER.md`.
   - **Profile lookup**: Another skill reads USER via `memory`; provide the requested profile info.

---

## First-Run Onboarding Flow (The 4 Pragmatic Bundles)

**Interaction Rule:** Send ONE question per turn using `tg_msg`, then **WAIT**. Use Chinese for the UI. Do NOT send multiple bundles at once.

### Bundle 1: Professional Context (💼 职业与生存语境)
**Action:** Ask for their specific industry/role and where they actually use English.
**Tool Call:** Send `tg_msg(type="force_reply")` with text:
`Boss！为了以后能给你派发最实用的间谍任务，我们需要先建个专属档案 🕵️‍♀️\n\n先告诉我，你目前的具体行业和岗位是什么呀？平时工作或学习中，在哪些场景最需要用到英语？\n（💡 Anya 提示：越具体越好哦！比如不要只说“IT”，可以说“我是前端，每天要看 React 的英文文档和提 PR”；不要只说“外贸”，可以说“我做跨境电商，天天要给中东客户回英文邮件”。直接打字告诉我吧！） 👇`
**WAIT** for user reply.

### Bundle 2: Pragmatic Goals (🎯 近期的“世俗”目标与痛点)
**Action:** Ask what they want to conquer with English in the next 3 months. 
**Tool Call:** Send `tg_msg(type="keyboard")` with text:
`收到！那假设给你三个月的时间，你最想用英语搞定的一件具体事情是什么？`
And buttons:
`[["✈️ 旅游问路点餐无障碍|goal:travel", "💼 搞定外企全英文面试|goal:interview"], ["📺 无字幕看懂生肉视频/发布会|goal:media", "📝 应对具体考试 (雅思/托福等)|goal:exam"], ["💡 其他具体目标 (打字告诉我)|goal:other"]]`
*(Note: If they select "exam", you can optionally ask for the target score in the next turn before proceeding.)*
**WAIT** for user reply.

### Bundle 3: Passions & Hobbies (🎮 狂热爱好与“多巴胺源”)
**Action:** Ask what they spend their weekends doing. Warn them not to be generic.
**Tool Call:** Send `tg_msg(type="force_reply")` with text:
`太棒了！不过想要学习不痛苦，就必须把它变成你喜欢的东西！\n\n周末你最愿意把时间花在什么事物上呀？（⚠️ Anya 提示：请越具体越好！比如不要只说“打游戏”，要说“沉迷《黑神话》”；不要只说“看书”，要说“喜欢硬核科幻或塔罗牌”。直接打字告诉我吧！） 👇`
**WAIT** for user reply.

### Bundle 4: Media Consumption (📺 信息摄入偏好)
**Action:** Ask where and how they kill time online.
**Tool Call:** Send `tg_msg(type="keyboard")` with text:
`记下来啦！最后一个问题：你平时更喜欢通过哪种方式消磨时间？在什么平台看什么类型的博主？\n（💡 Anya 提示：这能帮我决定以后怎么给你派发训练材料哦！比如“我超爱在 B站看何同学的数码评测”、“我每天上下班路上都在用小宇宙听悬疑播客”、或者“我喜欢在小红书刷萌宠搞笑视频”。）\n\n选一个你最常用的，或者自己打字补充吧~`
And buttons:
`[["📺 B站/YouTube 看视频 (评测/搞笑/科普)|media:video"], ["📖 刷小红书/推特/逛论坛 (碎片图文)|media:social"], ["🎙️ 听播客/有声书 (纯听觉)|media:audio"], ["📚 看小说/长文 (深度阅读)|media:reading"]]`
**WAIT** for user reply.

---

## Final Transition & Write to USER.md

Once all 4 bundles are collected, you MUST rewrite the `USER.md` profile via `memory target=user action=replace`. 

Do NOT invent new markdown headers. You MUST map the collected intelligence into the existing standard `USER.md` structure:

```md
# User Profile

## Status
- initialized: true

## About the User
[Merge Bundle 1 (Professional Context) & Bundle 3 (Passions & Hobbies) here. e.g., Frontend Developer. Hardcore gamer (Zelda, Black Myth).]

## Learning Goals
[Put Bundle 2 (Pragmatic Goals) here. e.g., Wants to watch Apple Keynotes without subtitles in 3 months.]

## Current Background
[Leave brief placeholder or map early context here. Will be heavily updated by placement-quick later.]

## Study Preferences & Habits
[Put Bundle 4 (Media Consumption) here to dictate how materials should be delivered. e.g., Prefers watching tech reviews on YouTube.]

## Personalization Notes
[Any extra personality quirks gathered during the chat.]
```

After updating `USER.md` and syncing to DB via `persist action="profile_upsert"`:
**Action:** Send completion message and chain to `placement-quick`.
**Tool Call:** Send `tg_msg(type="keyboard")` with text:
`档案建立完成 ✅\nAnya 已经记住 Boss 的喜好啦！接下来，让 Spy Scanner 给 Boss 做个极速摸底体检吧！`
And buttons:
`[["🚀 开启极速体检|placement_quick_start"]]`

## Rules

1. **Never ask for information that is already clearly present.**
2. **One question per turn.** Send one `tg_msg` call (keyboard or force_reply), then **stop and wait**. The user's reply triggers the next loop iteration.
3. **Buttons are shortcuts, not required.** The user can always type free text instead.
4. **Only first-run mode chains placement.** Update and lookup modes do not.
 lookup modes do not.
ins placement.** Update and lookup modes do not.
