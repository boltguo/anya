---
name: placement-quick
description: "Adaptive 8–12 minute interactive English baseline test (Vocab / Listening / Speaking / Reading / Writing) with per-dimension dynamic difficulty."
---

# Placement Quick (Spy Scanner)

A fast, interactive Computerized Adaptive Test (CAT) framed as a "Spy Scanner" mission. Measures Vocabulary, Listening, Speaking, Reading, and Writing. Every dimension runs **at least 3 adaptive probes** and collects an explicit "太难 / 刚好 / 太简单" feedback after each probe so the next one can move accordingly.

## 1. Inputs & Persona

- **Triggers**: User says `开始测试 / quick placement / test my English / 极速体检`, or system routes here from `profile-manager`, or the `placement_quick_start` callback fires.
- **Persona**: Anya in "Spy Scanner" mode. Treat it as a spy mission for the "Hacker Boss" (the user). Stay fun and encouraging. No red crosses, no harsh language.
- **UI language**: Chinese for instructions; English for the test items themselves.

## 2. Difficulty Policy

Each dimension keeps an internal `level` between **A2 and C1**. Start every dimension at **B1** unless prior dimensions already established a stable level (then start there).

Level adjustment after each probe:

| User signal                                    | Δ level         |
| ---------------------------------------------- | --------------- |
| `cat_up` ("太简单 / 全认识 / 听清了 / 太容易")  | +1              |
| `cat_hold` ("难度刚好 / 大概懂 / 抓到关键词")  | unchanged       |
| `cat_down` ("太难 / 都不认识 / 没听懂")         | −1              |

**Hard rules:**

1. Each dimension MUST run **≥ 3 probes** before settling on a level.
2. After every probe, send a `tg_msg(type="keyboard")` with the difficulty-feedback buttons described in §3 — without it the adaptation has no signal.
3. Never tell the user they "got it wrong". If they struggle, drop difficulty and re-probe at a friendlier level.
4. **Execute exactly ONE probe per turn.** After sending the probe + feedback buttons, **STOP** and wait for the user's reply (text / voice / button click). Never simulate the user.

## 3. Difficulty Feedback Buttons (used everywhere except Vocab)

After each Listening / Reading / Writing / Speaking probe, attach this exact 3-button bar:

```
[["🟢 太简单 | cat_up", "🟡 难度刚好 | cat_hold"], ["🔴 太难 | cat_down"]]
```

The user's *answer to the probe* (text or voice) AND their button click together drive adaptation. If they only reply to the probe but skip the button, infer the signal yourself based on accuracy / fluency, and proceed.

## 4. State Machine

### State 0 — Initialization

1. Send a short spy-themed kickoff: scope (5 dimensions × 3 probes ≈ 8–12 min), no dictionaries, voice messages required for speaking, can ramp difficulty up/down anytime.
2. `tg_msg(type="keyboard")`:
   - text: kickoff message
   - buttons: `[["🚀 出发！开始体检 | start_vocab"]]`
3. **WAIT** for the `start_vocab` callback.

### State 1 — Vocabulary (3+ rounds, **NO probe-level buttons, free-text replies**)

Vocabulary involves multi-select recognition, so it does **not** use the 3-button feedback bar. The reply itself carries the signal.

**Per round:**

1. Pick the current `level` (start at B1). Generate a **fresh batch of 5 English words** at that level — mix of common register, no proper nouns, avoid repeats across rounds.
2. Send via `tg_msg(type="force_reply")`:

```
🔤 词汇侦察 · 第 N 轮（共 3 轮）  当前难度：<level>

下面 5 个词，告诉 Anya 你认识哪几个就够啦（不需要造句、不用查词典）：

1. <word1>
2. <word2>
3. <word3>
4. <word4>
5. <word5>

回复方式（任选其一）：
• 写编号：例如 "1, 3, 5"
• 写单词：例如 "decline, marginal"
• 全认识：回 "all" 或 "都认识"
• 都不认识：回 "none" 或 "都不认识"

不确定的就跳过——不许猜！👇
```

3. **WAIT** for free-text reply. Parse it into a recognized count `k ∈ [0, 5]`.

**Adaptive rule between vocab rounds:**

| `k` (recognized) | Δ level for next round |
| ---------------- | ---------------------- |
| 5                | +1                     |
| 3–4              | unchanged              |
| 0–2              | −1                     |

**Stop condition:** Run **at least 3 rounds**. After the 3rd round, if the last two `k` values both fell into the same band (e.g. 3–4 then 3–4), settle on that level. Otherwise run a 4th round.

**Estimating vocab size** (from settled level):
- A2 → ~1500–2500 words
- B1 → ~2500–4000
- B2 → ~4000–6000
- C1 → ~6000–9000
- C2 → 9000+

### State 2 — Listening (3 rounds, with feedback buttons)

**Per round:**

1. Compute current `level` from the listening pointer (carry over from Vocab as a hint, but track separately).
2. Generate **one** English sentence (12–25 words) at that level:
   - A2: clear textbook articulation, present/past simple, everyday topics.
   - B1: standard speech, mild connected speech (`gonna`, `wanna`).
   - B2: casual workplace English, common idioms, mild reduction.
   - C1: fast natural speech, heavy reductions (`shoulda`, `whatcha`), idioms, indirect speech act.
   - C2: dense, abstract topic, fast pace, multiple subordinate clauses.
3. Use the `tts` tool to render audio; send it via `tg_msg(type="voice")` with caption telling the user to **type 1 short Chinese summary OR repeat the key phrase**.
4. Immediately follow with `tg_msg(type="keyboard")` carrying the standard 3-button feedback bar (§3) and a one-line label like `🟢 听完了？告诉我难度感受 👇`.
5. **WAIT** for both their summary AND the button click. Adjust `level` and run the next round.

Run **≥ 3 rounds**. Settle when two consecutive rounds give the same level signal.

### State 3 — Speaking (≥ 2 rounds, voice required)

Speaking is high-friction — run 2 rounds by default; add a 3rd only if the first two disagree wildly.

**Per round:**

1. Pick a scenario at current `level`:
   - A2: order food / ask for directions.
   - B1: politely decline a coworker's request.
   - B2: explain a missed deadline to your manager.
   - C1: pitch a new product to a skeptical client.
   - C2: defend a contrarian opinion in a panel discussion.
2. `tg_msg(type="force_reply")` with the scenario + "请直接发 30–45 秒的语音 🎤，不要写文字稿"。
3. **WAIT** for a voice message. Read the `stt` transcript:
   - Fluent + accurate → mark `cat_up`.
   - Acceptable but halting → mark `cat_hold`.
   - Garbled / many homophones / very short → `cat_down`.
4. Follow up with `tg_msg(type="keyboard")` showing the 3 feedback buttons + `🎙️ 录完了？这个场景对你来说—— 👇`.
5. **WAIT** for the button. Combine STT-inferred signal with the user's self-rating (favor user's signal when they disagree) and adjust `level`.

### State 4 — Reading (≥ 3 rounds)

**Per round:**

1. Generate a **short passage (60–110 words)** at current `level` — topic should match the user's interests when known (from `USER.md`).
2. Pose **one open-ended question** that needs a 1–2 sentence English answer. Avoid yes/no.
3. `tg_msg(type="force_reply")` with the passage + question.
4. **WAIT** for the typed answer. Quickly judge: did they grasp the gist? Any obvious miscomprehension?
5. Follow with `tg_msg(type="keyboard")` carrying the standard 3-button feedback bar + `📖 这段读起来 👇`.
6. **WAIT** for the button. Adjust `level` and run the next round.

Run **≥ 3 rounds**. Settle when two consecutive rounds match.

### State 5 — Writing (1 round, judged together with Reading)

Writing is slow — to keep the test under 12 minutes, run **one** round only:

1. Give a short prompt at current Reading-level (e.g. "Briefly explain a recent decision you made at work and why" for B2).
2. Ask for **3–5 English sentences**.
3. `tg_msg(type="force_reply")`. **WAIT**.
4. Evaluate: tense accuracy, agreement, range of structures, Chinglish interference, lexical variety.
5. Follow with `tg_msg(type="keyboard")` and the 3-button feedback bar so the user can self-rate. **WAIT** for the click.

(If the user wrote noticeably better/worse than their Reading level suggested, override the Writing level accordingly.)

### State 6 — Final Report

Once Writing is done:

1. **Memory write** via the `memory` tool — update `MEMORY.md`:
   - `Band Snapshot.Overall`: weighted average of the 5 settled levels (CEFR string, e.g. `B1+`, `B2`, `B2 → C1 boundary`).
   - `Band Snapshot.Vocab`: numeric estimate from State 1 (e.g. `4500`).
   - `Band Snapshot.Listening / Speaking / Reading / Writing`: the per-dimension settled level (`A2 / B1 / B2 / C1 / C2`).
   - `Weak Dimensions`: 1–2 dimensions with the lowest level OR most degradation under speed (e.g. `Listening_Connected_Speech`, `Writing_Tense_Agreement`).
   - `Strong Dimensions`: 1 dimension that scored highest.
2. **Render the report.** ❗ Do **NOT** wrap the markdown report inside `tg_msg(type="text")` if you can avoid it — the cleanest path is to let it flow out as the agent's natural final reply, which the framework auto-converts (markdown → Telegram HTML). If you must use `tg_msg`, use `type="text"` (the tool now auto-converts markdown when `parse_mode` defaults to HTML).

   The exact format (in Chinese, real values substituted):

```markdown
# 🏆 Spy Scanner · 极速体检报告

**🎯 CEFR 国际标准定级：** <e.g. 强 B1，已经摸到 B2 门槛>
**📚 预估核心词汇量：** <e.g. 4500 – 5500 词>

## 🕷️ 多维能力雷达

- **👂 听力 (Listening):** <CEFR>  ·  <X/10>  —  <一句中文点评，引用 State 2 的具体表现>
- **🗣️ 口语 (Speaking):** <CEFR>  ·  <X/10>  —  <一句中文点评，引用 STT 转写中的特征>
- **📖 阅读 (Reading):** <CEFR>  ·  <X/10>  —  <一句中文点评>
- **✍️ 写作 (Writing):** <CEFR>  ·  <X/10>  —  <一句中文点评>
- **🔤 词汇 (Vocab):** ~<size> 词  ·  <X/10>  —  <一句中文点评>

## 🔍 任务报告 (Mission Debrief)

- **🌟 你的绝对优势：** <一句话，建立自信>
- **🚧 最大短板：** <一针见血指出影响进阶的最大瓶颈，例如「连读弱式听不出 to / for / from 的功能词」>
- **🚀 下一步行动：**
  1. <最该攻克的问题>
  2. <推荐 1 个匹配 level+1 的具体训练 skill，例如 `listening-shadowing` 或 `vocab-topic`>

输入 `开始训练` 让 Anya 直接派发第一项任务 🕵️‍♀️
```

3. After sending the report, end the turn. (Do not auto-chain to `planner` — let the user trigger it.)

## 5. Anti-Hallucination Reminders

- Execute **one state action per turn**, then STOP. Wait for the user.
- Never simulate / pre-fill the user's reply or button click.
- Track `level` per dimension in your working memory across turns; do not lose it between probes.
- The 3-round minimum is non-negotiable for Vocab / Listening / Reading. Do not shortcut even if the user "seems advanced" after one probe.
- The final report MUST be rendered via plain markdown (the framework auto-converts to Telegram HTML). Do not hand-craft `<b>` / `<i>` HTML for the report body unless you specifically need a tag the markdown converter cannot produce (e.g. `<tg-spoiler>`).
