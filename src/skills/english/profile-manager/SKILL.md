---
name: profile-manager
description: "Build or update the learner's profile in study.db; also the /profile-manager command and first-run onboarding dispatcher."
---

# Profile Manager

Owner of the `learner_profile` row in `study.db`. Builds or corrects a short structured user profile. On first-run (or `/profile-manager`), also dispatches the full onboarding: profile → `placement-quick` → `planner`.

## When to Use

- `/profile-manager` command
- `建档 / 重新建档 / 改目标 / update profile / 我换工作了`
- Another skill needs profile context that is still missing
- `我的档案是什么 / show my profile`

## Workflow

0. **Bootstrap study.db** — call `persist` with `{"action":"coach_context","days":1,"limit":3}`. The response returns the current `profile` row (or `null` if absent).
1. Decide mode from the `profile` row:
   - **First-run** (`profile` is null or `initialized=0`): Execute the **4-Step Onboarding Flow** below.
   - **Targeted update** (`profile` exists and user wants to change something): Parse intent, ask at most one clarifying question, then write the changed fields via `persist action="profile_upsert"`. Do **not** re-run the 4 bundles.
   - **Profile lookup**: Use the `profile` returned by `coach_context` and answer the user directly.

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

## Final Transition & Write to study.db

Once all 4 bundles are collected, write the profile via **one** `persist action="profile_upsert"` call. Map bundles into the structured columns:

| Bundle                       | Persist field    | Notes                                                                       |
| ---------------------------- | ---------------- | --------------------------------------------------------------------------- |
| 1 — Profession context       | `daily_english`  | Concise sentence: industry / role + concrete English use cases.             |
| 2 — Learning goal            | `target_level` + `target_exam` + `exam_date` + `notes` | Fill the structured fields when the user mentioned an exam / score / timeframe; otherwise put the goal sentence in `notes`. |
| 3 — Personal interests       | `interests`      | JSON array of short tags (e.g. `["黑神话·悟空","艾尔登法环","硬核科幻"]`) or comma-separated text. |
| 4 — Media consumption        | `notes`          | Append after the goal; one short paragraph the planner can use to pick material. |

Also set `initialized=1`. Example call shape:

```
persist action="profile_upsert"
  initialized=1
  daily_english="Frontend dev at a SaaS startup; daily reading of React/Node docs and reviewing PRs for overseas teammates."
  target_level="B2"   // optional
  target_exam="IELTS" // optional, default IELTS
  exam_date="2026-08-01" // optional
  interests='["黑神话·悟空","艾尔登法环","硬核科幻"]'
  notes="Goal: pass an all-English technical interview in ~3 months.\nMedia: Fireship on YouTube, 何同学 on B站, Hardcore History podcast on commute.\nTopic rotation: half work-themed, half hobby-themed."
```

After `profile_upsert`, mark onboarding step complete:

```
persist action="onboarding_done" step="profile"
```

This flips `config.onboarding.profile_done = true` so future `/new` skips the profile button.

Then send the completion message and **immediately** chain into `placement-quick` — no confirmation button:

1. Send `tg_msg(type="text")`:

```
档案建立完成 ✅
Boss 的喜好已经全部进入 Anya 加密档案库 🗂️

接下来直接进入极速摸底体检，5–8 分钟搞定 ✨
```

2. Immediately call `skill_view("placement-quick")` to start the placement test. Do NOT wait for user input.

## Rules

1. **Never ask for information that is already clearly present** in the existing `profile` row (returned by `coach_context`).
2. **One question per turn.** Send one `tg_msg(type="text")`, then **stop and wait**.
3. **No buttons in the 4 onboarding bundles.** All four are free-text — keep the format consistent.
4. **Only first-run mode chains placement.** Update and lookup modes do not.
5. **Use HTML inline tags sparingly** (`<b>`, `<i>`, `<code>`) — bullet lists and emoji markers are fine and render correctly via the framework's auto-conversion.
6. **Never call the `memory` tool.** Profile state lives in `study.db` (via `persist`); onboarding flags live in `config.json` (written via `persist action="onboarding_done"`).
7. **First-run vs update is decided purely from the `profile` row** returned by step 0's `coach_context`. Do not read `config.onboarding`.
