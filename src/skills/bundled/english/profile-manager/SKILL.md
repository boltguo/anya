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

## First-Run Onboarding Flow (4 Free-Text Bundles)

**Interaction Rules** (apply to every bundle below):

1. Send **ONE** question per turn via `tg_msg(type="text")`. **Never** use `keyboard` here — every bundle is free-text so the user can answer in their own words.
2. After sending, **STOP** and **WAIT** for the user's reply. Do not preview the next question.
3. UI language is **Chinese**. Tone: Anya the spy — playful, encouraging, never lecturing.
4. Every bundle shares the same template:
   - 1 short opener (≤ 1 sentence) acknowledging the previous reply.
   - 1 clear question.
   - 1 `💡 Anya 提示：` line with **2–3 concrete examples** so the user knows the expected granularity.
   - 1 trailing call-to-action (👇 / 直接告诉我吧 / etc).
5. If the user's reply is too vague (e.g. "IT"、"打游戏"、"考试"), ask **one** follow-up before moving on.

### Bundle 1 — 💼 职业与生存语境

`tg_msg(type="text")` 文案：

```
Boss！为了以后能给你派发最对味儿的间谍任务，我们先建个专属档案 🕵️‍♀️

第 1 题（共 4 题）：你目前的具体行业 / 岗位是什么？平时在哪些场景最需要英语？

💡 Anya 提示：越具体越好哦~
• "前端开发，每天读 React 文档、给海外同事 review PR"
• "跨境电商运营，主要给中东客户回邮件 + 处理售后"
• "在校研究生，要读 paper、写组会报告"

直接打字告诉我吧 👇
```

→ **WAIT**

### Bundle 2 — 🎯 近期想搞定的具体目标

`tg_msg(type="text")` 文案（**注意：无按钮，纯自由文本**）：

```
收到！第 2 题（共 4 题）：未来 3 个月里，你最想用英语搞定的一件具体事情是什么？

💡 Anya 提示：可以参考这些方向（也欢迎完全自己写）——
• 📝 备考类：雅思 7 / 托福 100 / 四六级 / BEC 中高级
• 💼 职业类：全英文面试、跨国会议发言、写英文周报、英文 PR / Code Review
• 🌍 生活类：欧美旅游能点餐问路、看脱口秀不依赖字幕、听播客 / 读原版小说
• 📚 学术类：读懂 paper、写英文论文摘要、做学术 presentation

如果是考试，最好顺手报一下目标分数；如果是工作，写清楚使用频率（例如"每周 2 次站会"）。直接打字告诉我吧 👇
```

→ **WAIT**

### Bundle 3 — 🎮 狂热爱好与多巴胺源

`tg_msg(type="text")` 文案：

```
太棒了，目标已锁定 🎯 第 3 题（共 4 题）：周末或下班后，你最愿意把时间花在什么事物上？

⚠️ 注意：要够具体，泛泛而谈我接不住~
• ❌ "打游戏" → ✅ "沉迷《黑神话·悟空》和《艾尔登法环》"
• ❌ "看书" → ✅ "硬核科幻 + 历史非虚构，最近在啃《三体》英文版"
• ❌ "看剧" → ✅ "美剧迷，最爱《Severance》《True Detective》"

把训练任务变成你喜欢的东西，学起来才不痛苦 😎 直接打字告诉我吧 👇
```

→ **WAIT**

### Bundle 4 — 📺 信息摄入偏好

`tg_msg(type="text")` 文案（同样改为纯自由文本，跟前 3 题统一）：

```
记下来啦！最后一题（4/4）：你平时主要通过哪种方式消磨碎片时间？常去哪些平台？关注哪类博主 / 频道？

💡 Anya 提示：这能决定我以后怎么给你"投喂"训练材料~
• 📺 视频："B 站看何同学数码评测 + YouTube 看 Fireship 编程"
• 🎙️ 音频："上下班路上听《Hardcore History》和《无人知晓》"
• 📖 图文："小红书刷穿搭 + Twitter 看 AI 圈快讯"
• 📚 长文："Medium 看产品设计 + 推理小说"

挑你最常用的写就行，多个也可以。直接打字告诉我吧 👇
```

→ **WAIT**

---

## Final Transition & Write to USER.md

Once all 4 bundles are collected, you MUST rewrite the `USER.md` profile via `memory target=user action=replace`.

Do NOT invent new markdown headers. You MUST map the collected intelligence into the existing standard `USER.md` structure:

```md
# User Profile

## Status
- initialized: true

## About the User

**Professional context.** [Bundle 1 here. e.g., Frontend developer at a SaaS startup, occasional cross-stack and AI-tooling work. Uses English mainly for technical docs.]

**Personal interests.** [Bundle 3 here — keep this as a separate paragraph so hobbies don't get steamrolled by the professional line. e.g., Sci-fi novels and films, Black Myth / Elden Ring, MOBA mobile games, weekend bouldering.]

## Learning Goals
[Put Bundle 2 here, including the timeframe and any concrete metric the user mentioned. e.g., 3 months → pass a fully English technical interview at a foreign-funded company; secondary goal: read React/Node docs without translation.]

## Current Background
[Leave a brief placeholder — `placement-quick` will fill in CEFR level, vocab estimate, and weak dimensions.]

## Study Preferences & Habits
[Put Bundle 4 (Media Consumption) here. Note both medium AND content type, so material recommendations can match. e.g., Prefers short-form tech videos (Fireship, 何同学); also listens to long-form history podcasts on commute.]

## Personalization Notes
[Any extra personality quirks gathered during the chat — e.g., self-described "lazy but competitive", responds well to game-like challenges.]

**Topic rotation rule (always include this paragraph verbatim, adapted to the user's actual hobbies):** Practice content should rotate across both sides of the learner's world — roughly half work/professional-themed and half hobby-themed (films, games, anime, sports, music — whatever Bundle 3 captured). Do not default every example to the user's profession just because that's their day job; hobby topics are equally valid practice material.
```

After updating `USER.md`, sync to DB via `persist action="profile_upsert"`.

Then send the completion message and **immediately** chain into `placement-quick` — no confirmation button:

1. Send `tg_msg(type="text")`:

```
档案建立完成 ✅
Boss 的喜好已经全部进入 Anya 加密档案库 🗂️

接下来直接进入极速摸底体检，5–8 分钟搞定 ✨
```

2. Immediately call `skill_view("placement-quick")` to start the placement test. Do NOT wait for user input.

## Rules

1. **Never ask for information that is already clearly present.**
2. **One question per turn.** Send one `tg_msg(type="text")`, then **stop and wait**.
3. **No buttons in the 4 onboarding bundles.** All four are free-text — keep the format consistent.
4. **Only first-run mode chains placement.** Update and lookup modes do not.
5. **Use HTML inline tags sparingly** (`<b>`, `<i>`, `<code>`) — bullet lists and emoji markers are fine and render correctly via the framework's auto-conversion.
