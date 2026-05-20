---
name: profile-manager
description: "Onboard a new learner (study.db + USER.md) and dispatch first-run flow to placement-quick."
---

# Profile Manager

Owns the `learner_profile` row in `study.db` and the prose summary in `USER.md`.

## Triggers

- `/profile-manager` command or `details.skill = profile-manager`
- 用户说"建档 / 重新建档 / 改目标 / 换工作 / 我的档案是什么"
- Another skill reports missing profile context

## Workflow

1. **Bootstrap**: call `persist {action:"coach_context", days:1, limit:3}` — the response contains the `profile` row.
2. **Pick mode** from `profile`:
   - `null` or `initialized=0` → **First-run** (single-shot question, then 4-write final transition)
   - exists, user wants a change → **Targeted update** (parse intent, optional 1 clarifying Q, then write only changed fields to DB and mirror the relevant USER.md section)
   - user only asks what's stored → **Lookup** (answer from the row directly)

---

## First-Run Single-Shot Question

Send **one** `tg_msg(type="render")` (text only, no buttons):

```
先建个间谍档案 🕵️‍♀️ 一次说完就行，写得越细 Anya 后面越能给你定制训练。

请把下面 4 件事大致说一下（顺序、详略随你，全写一段也行）：

1️⃣ <b>英语水平</b>：现在大概什么感觉？有没有四六级 / 雅思 / 托福 / BEC 分数？
2️⃣ <b>行业 + 英语场景</b>：做什么的，平时哪些时候要用英语？
3️⃣ <b>想搞定的事</b>：最想用英语做什么？有没有时间表 / 目标分数？
4️⃣ <b>兴趣 & 信息来源</b>：游戏 / 剧 / 综艺 / 博主，常逛哪些 App？

💡 举个参考格式（不必照抄）——
"前端开发，CET-4 刚过，每天读 React 文档；想半年内通过英文面试；沉迷《黑神话·悟空》，B 站常看游戏解说"

直接打字告诉 Anya 吧 👇 越多越好。
```

→ **STOP and WAIT**. If the reply is unusable ("学英语" / "IT"), ask 1 follow-up; otherwise go straight to the Final Transition.

---

## Final Transition — 4 Writes (first-run only)

1. **`persist action="profile_upsert"`** — `initialized=1` plus whatever you can map:
   - `current_level` CEFR guess (CET-4 → A2+, CET-6 → B1, IELTS 6 → B1+, IELTS 7 → B2+)
   - `target_level` / `target_exam` / `exam_date` only when the user named them
   - `daily_english` — one concise sentence: industry + role + frequency
   - `interests` — JSON array of tags in **English** (hobby content + platforms, e.g. `["Honor of Kings","Severance","Fireship","X"]`)
   - `notes` — the user's raw answer for traceability

2. **`memory target=user action=replace`** — rewrite USER.md as a short **English** prose summary, three sections only: `## Background` / `## Goal` / `## Interests & Media`.

3. **`persist action="onboarding_done" step="profile"`**.

4. **`tg_msg type="render"`** — completion message + placement button:
   ```
   text:    "档案建立完成 ✅\n情报已全部进入 Anya 加密档案库 🗂️\n\n下一步是极速摸底体检（5–8 分钟），帮 Anya 摸清你各项能力的真实水位。\n点下面按钮开始 👇"
   buttons: [["📊 开始快速评测|placement-quick"]]
   ```
   `placement-quick` is a skill-switch callback — clicking spawns a fresh session.

## Rules

- Never re-ask for info already present in the existing `profile` row.
- Only **first-run** triggers the 4-write final transition + placement button. Targeted update / lookup write changed fields only.
