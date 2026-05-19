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

1. Send **ONE** question per turn via `tg_msg(type="render")` (text only, no `url`/`buttons`). Every bundle is free-text so the user can answer in their own words — never attach `buttons`.
2. After sending, **STOP** and **WAIT** for the user's reply. Do not preview the next question.
3. UI language is **Chinese**. Tone: Anya the spy — playful, encouraging, never lecturing.
4. Every bundle shares the same template:
   - 1 short opener (≤ 1 sentence) acknowledging the previous reply.
   - 1 clear question.
   - 1 `💡 Anya 提示：` line with **2–3 concrete examples** so the user knows the expected granularity.
   - 1 trailing call-to-action (👇 / 直接告诉我吧 / etc).
5. If the user's reply is too vague (e.g. "IT"、"打游戏"、"考试"), ask **one** follow-up before moving on.

### Bundle 1 — 📍 英语起点

`tg_msg(type="render")` (text only, no `url`/`buttons`) 文案：

```
先建个间谍档案 🕵️‍♀️ 共 4 题。

第 1 题：你英语大概什么水平？描述一下日常实际用英语的感觉就行。

💡 选一条最接近的，怎么补充都行——
• 基本看不懂、几乎不会说
• 中学/大学学过，能蹦几个词，平时基本不用
• 简单技术文档 / 邮件能看懂大半，开口磕磕巴巴
• 能比较流利地读 / 听 / 写工作内容，开口偶尔卡顿
• 日常工作生活都能用英语，想再精进
• 有的话可以顺手报一下：四六级 X 分 / 雅思 X / 托福 X / BEC X

直接打字告诉我吧 👇
```

→ **WAIT**

### Bundle 2 — 💼 职业与英语场景

`tg_msg(type="render")` (text only, no `url`/`buttons`) 文案：

```
收到！第 2 题：你目前的具体行业 / 岗位是什么？平时在哪些场景最需要英语？

💡 越具体越好，最好把"行业 + 岗位 + 高频场景"都说清楚——
• "前端开发，每天读 React 文档、给海外同事 review PR、每周 1 次英文站会"
• "跨境电商运营，主要给中东客户回邮件 + 处理售后，每天 30+ 邮件"
• "在校研究生（计算机视觉方向），要读 paper、写组会汇报、偶尔投会议"
• "外贸业务员，跟欧美客户每天微信 + 月度 zoom 会议"

直接打字告诉我吧 👇
```

→ **WAIT**

### Bundle 3 — 🎯 学习目标

`tg_msg(type="render")` (text only, no `url`/`buttons`) 文案：

```
明白了！第 3 题：你最想用英语搞定的一件事情是什么？什么时间想搞定？

💡 自己怎么想就怎么写，不必套时间——
• 📝 备考：要考雅思 / 托福 / 四六级 / BEC，目标分数 + 大概打算几月考
• 💼 工作：通过全英文面试、能独立开英文会、能写英文周报…
• 🌍 生活：欧美旅游能聊起来、看美剧不依赖字幕、追原版播客…
• 📚 兴趣：能读原版小说 / paper，能跟海外朋友长聊…

直接打字告诉我吧 👇
```

→ **WAIT**

### Bundle 4 — 🎮 兴趣 & 信息摄入

`tg_msg(type="render")` (text only, no `url`/`buttons`) 文案：

```
最后一题（4/4）：你下班 / 周末喜欢什么？平时常在哪些 App、关注哪类博主 / 频道？

💡 兴趣 + 平台一起说，越具体越好（材料就从这里挑）——
• 🎮 "沉迷《黑神话·悟空》《艾尔登法环》，B 站常看游戏解说"
• 🎬 "美剧迷《Severance》《True Detective》；
• 🎙️ "通勤听《Hardcore History》《无人知晓》； Twitter 看 AI 圈快讯"
• 📚 "硬核科幻 + 历史非虚构；Medium 看产品设计"

直接打字告诉我吧 👇
```

→ **WAIT**

---

## Final Transition & Write to study.db

Once all 4 bundles are collected, write the profile via **one** `persist action="profile_upsert"` call. Map bundles into the structured columns:

| Bundle                  | Persist field                                              | Notes                                                                                                 |
| ----------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1 — English starting level | `current_level` + `notes`                               | Map to a CEFR-equivalent guess (e.g. CET-4 → A2+, CET-6 → B1, IELTS 6 → B1+, IELTS 7 → B2+). Put the user's raw answer in `notes` for traceability. |
| 2 — Profession context  | `daily_english`                                            | Concise sentence: industry + role + concrete English use cases + frequency.                           |
| 3 — Learning goal       | `target_level` + `target_exam` + `exam_date` + `notes`     | Fill the structured fields when the user mentioned an exam / score / timeframe; otherwise put the goal sentence in `notes`. |
| 4 — Interests & media   | `interests`                                                | JSON array of short tags covering both hobby content AND platforms (e.g. `["黑神话·悟空","Severance","Fireship","B站","小红书"]`). |

Also set `initialized=1`. Example call shape:

```
persist action="profile_upsert"
  initialized=1
  current_level="B1"
  daily_english="Frontend dev at a SaaS startup; daily reading of React/Node docs and reviewing PRs for overseas teammates; weekly English standup."
  target_level="B2"
  target_exam="IELTS"
  exam_date="2026-08-01"
  interests='["黑神话·悟空","艾尔登法环","Severance","Fireship","B站","Hardcore History"]'
  notes="Start: CET-6 502 (2022). Goal: pass an all-English technical interview; IELTS 6.5 as reference."
```

After `profile_upsert`, mark onboarding step complete:

```
persist action="onboarding_done" step="profile"
```

This flips `config.onboarding.profile_done = true` so future `/new` skips the profile button.

Then send the completion message and **immediately** chain into `placement-quick` — no confirmation button:

1. Send `tg_msg(type="render")` (text only, no `url`/`buttons`):

```
档案建立完成 ✅
情报已经全部进入 Anya 加密档案库 🗂️

接下来直接进入极速摸底体检，5–8 分钟搞定 ✨
```

2. Immediately call `skill_view("placement-quick")` to start the placement test. Do NOT wait for user input.

## Rules

1. **Never ask for information that is already clearly present** in the existing `profile` row (returned by `coach_context`).
2. **One question per turn.** Send one `tg_msg(type="render")` (text only), then **stop and wait**.
3. **No buttons in the 4 onboarding bundles.** All four are free-text — keep the format consistent (`render` with text only, never attach `buttons`).
4. **Only first-run mode chains placement.** Update and lookup modes do not.
5. **Use HTML inline tags sparingly** (`<b>`, `<i>`, `<code>`) — bullet lists and emoji markers are fine and render correctly via the framework's auto-conversion.
6. **Never call the `memory` tool.** Profile state lives in `study.db` (via `persist`); onboarding flags live in `config.json` (written via `persist action="onboarding_done"`).
7. **First-run vs update is decided purely from the `profile` row** returned by step 0's `coach_context`. Do not read `config.onboarding`.
8. **All Telegram sends go through `tg_msg type="render"`.** Every bundle and the completion message use render. Never use stand-alone `text` / `keyboard` / `voice` / `react` calls.
