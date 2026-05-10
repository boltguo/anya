---
name: placement-quick
description: "Adaptive 8–12 minute interactive English baseline test (Vocab / Listening / Speaking / Reading / Writing). Per-dimension difficulty inferred silently from each answer; mandatory domain rotation; outputs a {general_level, domain_level, confidence} tuple per dimension with sub-band CEFR granularity."
---

# Placement Quick (Spy Scanner)

A fast Computerized Adaptive Test (CAT) framed as a "Spy Scanner" mission. Measures Vocabulary, Listening, Speaking, Reading, Writing. Each dimension runs **≥ 3 adaptive probes** (Speaking ≥ 2, Writing 1) with **enforced domain rotation** — at least one probe per dimension must be on a non-tech / non-work topic. Difficulty adapts **silently from the user's answer content** (no self-rating buttons).

## 1. Inputs & Persona

- **Triggers**: `开始测试 / quick placement / test my English / 极速体检`，or routed from `profile-manager`，or `placement_quick_start` callback.
- **Persona**: Anya in "Spy Scanner" mode — fun, encouraging, no harsh language, no red crosses.
- **UI language**: Chinese for instructions; English for the test items themselves.
- **User profile** (read once at State 0): `USER.md` — `interests` / `profession` / `target_cefr`. Used to compose **in-domain** probes ONLY when the rotation rule (§2.2) calls for it.

## 2. Difficulty Policy

Each dimension keeps an internal `level` with **sub-band granularity**: `A2- / A2 / A2+ / B1- / B1 / B1+ / B2- / B2 / B2+ / C1- / C1 / C1+`. Start every dimension at **B1**.

### 2.1 Adaptation signal — 4-bucket

After every probe, judge the answer silently and pick exactly ONE signal:

| Signal      | Δ level    | Meaning                                                  |
| ----------- | ---------- | -------------------------------------------------------- |
| `up`        | +1 band    | clean evidence at current level                          |
| `hold-up`   | +0.5 band  | mostly correct, missing one feature                      |
| `hold-down` | −0.5 band  | gist captured but breakdown signals (see §3)             |
| `down`      | −1 band    | off-topic / breakdown / opt-out vocabulary               |

Per-dimension inference rules in §3.

### 2.2 Domain rotation rule (mandatory)

For each dimension that runs ≥ 3 probes (Listening / Reading; Vocab is exempt because words are domain-neutral):

- **Round 1**: in-domain (tech / AI / programming based on USER.md).
- **Round 2**: **non-domain — mandatory**. Rotate through `日常生活 / 体育 / 影视剧情 / 旅行 / 食物 / 自然环境`.
- **Round 3+**: target the level uncertainty — pick whichever domain stresses the boundary.

**Speaking** (≥ 2 rounds): Round 1 in-domain, Round 2 non-domain. Both required.
**Writing** (1 round): non-domain prompt always — productive ability must be tested outside comfort zone.

If non-domain probe lands ≥ 1 band below in-domain probe, record `general_level = non-domain`, `domain_level = in-domain`, and degrade `confidence` one notch.

### 2.3 Unified Chinese opt-out vocabulary

These phrases in user replies are **signals, not answers**. Recognise them:

| Phrase                              | Meaning                          | Adaptation effect                                                       |
| ----------------------------------- | -------------------------------- | ----------------------------------------------------------------------- |
| `不认识 / 不会 / 没学过`            | vocab unknown                    | Vocab `k=0` for that word; round signal → `down`                        |
| `没听清 / 听不清`                   | audio not caught                 | Re-emit same audio ONCE; if still no parse → `down`                     |
| `听不懂 / 没听懂`                   | listening comprehension failure  | `down`                                                                  |
| `看不懂 / 读不懂`                   | reading comprehension failure    | `down`                                                                  |
| `模糊 / 大概 / 差不多`              | low-confidence self-report       | Degrade signal one notch (`up→hold-up`, `hold-up→hold-down`, …)         |
| `换简单点 / 太难了`                 | explicit difficulty drop request | `down` AND next probe drops one full band                               |

**Never use English `skip / I don't know`** in prompts — the user replies in Chinese; we recognise Chinese.

### 2.4 Hard rules

1. Each dimension runs **≥ 3 probes** (Speaking ≥ 2, Writing 1) before settling.
2. Never tell the user they "got it wrong". If they struggle, drop difficulty and re-probe.
3. **Execute exactly ONE probe per turn.** After sending the probe, **STOP** and wait for the user's reply.
4. **No difficulty self-rating buttons.** The answer alone drives adaptation. Only buttons in this skill: State 0 kickoff.
5. **Domain rotation Round 2 is non-negotiable** — skipping it forces `confidence = low` for that dimension.
6. **ALL replies MUST use `tg_msg`.** Never return a bare text response. Every message to the user — probes, feedback, transitions, the final report — MUST go through a `tg_msg` tool call with the appropriate `type` (`text`, `keyboard`, `voice`). Returning text without calling `tg_msg` will cause the message to be silently swallowed.

## 3. Adaptation Inference Rules

Apply per dimension. If the reply matches §2.3 opt-out vocabulary, follow that mapping first.

### 3.1 Listening (State 2)

Required reply format: 1 中文 sentence (gist) + 1–2 English keywords from the audio.

- `up`: gist matches **AND** ≥ 2 specific content words/phrases reproduced correctly.
- `hold-up`: gist matches **AND** 1 content word reproduced.
- `hold-down`: gist matches **AND** 0 English keywords; OR phrase parroting in place of summary; OR reply contains zero English at all.
- `down`: gist wrong, off-topic, or opt-out vocabulary.

### 3.2 Speaking (State 3)

Read the STT transcript:

- `up`: addresses scenario; ≥ 5 sentences or ~30 s; < 5 fillers; recognisable structures at target level.
- `hold-up`: addresses scenario; 3–4 sentences; mid-sentence drops but recovers; minor grammar slips.
- `hold-down`: addresses scenario but halting; restarts; narrow vocabulary; ≥ 3 grammar slips at target level.
- `down`: garbled STT, off-topic, < 15 s, or ≥ 30% Chinese tokens mixed in.

### 3.3 Reading (State 4)

Required reply: 1–2 English sentences answering the question.

**Rule of thumb**: this dimension scores **reading comprehension first**. Productive weakness (brevity, grammar, Chinglish) belongs mainly to Writing (§3.4), so do not double-penalize it here. However, a very short fragment is only enough evidence when it answers the question's fact / inference relationship, not merely when it repeats a keyword from the passage. Mark those cases as limited evidence and lower confidence.

- `up`: paraphrases the gist in own words; correct; no copy-paste.
- `hold-up`: correct fact / inference, but expressed as a short fragment, broken grammar, or minor paraphrase. Comprehension is clear enough; expression is shaky. Add a `limited_evidence` flag if the answer is fewer than 5 words.
- `hold-down`: copy-paste of a sentence containing the answer (≥ 5-token verbatim span from passage); OR answer in Chinese (≥ 60% Chinese tokens) — both signal "couldn't process into own English".
- `down`: off-topic, factually wrong, keyword-only without the required relationship, or opt-out vocabulary.

**Cap rule**: copy-paste verbatim ≥ 5 tokens caps the signal at `hold-down` regardless of correctness.

### 3.4 Writing (State 5)

- `up`: 3+ sentences, varied tense, no Chinglish, recognisable structures at target level.
- `hold-up`: 3+ sentences, occasional grammar slips, limited variety.
- `hold-down`: 3 sentences with frozen tense OR 1–2 Chinglish collocations.
- `down`: < 3 sentences, dominant Chinglish, or Chinese reply.

### 3.5 Vocabulary (State 1)

Vocab uses the recognised count `k` directly (simpler than 4-bucket):

| `k` (recognised of 5) | Δ level for next round |
| --------------------- | ---------------------- |
| 5                     | +1 (up)                |
| 3–4                   | unchanged (hold)       |
| 0–2                   | −1 (down)              |

Reply containing `不认识 / 不会` is treated as `k = 0`.

## 4. State Machine

### State 0 — Initialization

1. Send a short spy-themed kickoff covering: scope (5 dimensions × ~3 probes ≈ 8–12 min), no dictionaries, voice required for speaking, **题目会在熟悉领域和陌生领域之间切换**。
2. `tg_msg(type="keyboard")`:
   - text: kickoff message
   - buttons: `[["🚀 出发！开始体检|start_vocab"]]`
3. **WAIT** for the `start_vocab` callback.

### State 1 — Vocabulary (≥ 3 rounds)

Vocab words are **domain-neutral by default** — pick a mix of register (concrete + abstract + functional verbs) without bias toward tech/AI. No proper nouns, avoid repeats across rounds.

**Per round:**

1. Pick current `level` (start at B1). Generate **5 fresh English words** at that level.
2. Send via `tg_msg(type="text")`:

```
🔤 词汇侦察 · 第 N 轮（共 3 轮）  当前难度：<level>

下面 5 个词，告诉 Anya 你认识哪几个就够啦（不需要造句、不用查词典）：

1. <word1>
2. <word2>
3. <word3>
4. <word4>
5. <word5>

回复方式（任选其一）：
• 写编号："1, 3, 5"
• 写单词："decline, marginal"
• 全认识："都认识"
• 都不认识："不认识"

模糊的就别选——不许猜！👇
```

3. **WAIT** for free-text reply. Parse into `k ∈ [0, 5]`.
4. Apply §3.5 rule; advance `level`; next round.

**Stop**: ≥ 3 rounds. After round 3, if last two `k` fell in the same band, settle there. Otherwise run round 4.

**Vocab size estimate** (from settled level):
- A2 → ~1500–2500   B1 → ~2500–4000   B2 → ~4000–6000   C1 → ~6000–9000   C2 → 9000+

### State 2 — Listening (≥ 3 rounds, with domain rotation)

**Domain rotation**: R1 in-domain · R2 **non-domain (mandatory)** · R3 target boundary. Pick R2 topic from `日常生活 / 体育 / 影视剧情 / 旅行 / 食物 / 自然`.

**Per round:**

1. Compute `level`. Generate **one** English sentence (12–25 words) at that level:
   - A2: textbook articulation, present/past simple, everyday topics.
   - B1: standard speech, mild connected speech.
   - B2: casual workplace English, common idioms, mild reduction.
   - C1: fast natural speech, heavy reductions, idiomatic.
   - C2: dense, abstract, multiple subordinate clauses.
2. Render via `tts`; send `tg_msg(type="voice")` with caption:

```
👂 听力侦察 · 第 N/3 轮  难度：<level>  领域：<topic 中文标签>

听完后，<b>用一句中文写出你听到的主旨</b>，并附 1–2 个你抓到的英文关键词。
没听清回 "没听清" 我会再放一次；听不懂回 "听不懂"，自动降难度。
```

3. **WAIT** for typed reply.
4. Apply §3.1 rule. Adjust `level`. Next round.

**Stop**: ≥ 3 rounds. Settle when 2 consecutive rounds give matching signals AND R1 ↔ R2 differ by ≤ 0.5 band. If R1 ↔ R2 differ ≥ 1 band, run R4 to break the tie (record both as general/domain levels).

### State 3 — Speaking (≥ 2 rounds, voice required)

**Domain rotation**: R1 in-domain (work-adjacent at user's level) · R2 **non-domain** (sports / travel / daily anecdote / movie recommendation).

**Per round:**

1. Pick scenario at current `level`:
   - A2: order food / ask for directions / describe your weekend.
   - B1: politely decline a coworker's request / recommend a hobby to a friend.
   - B2: explain a missed deadline / argue why you'd recommend a recent movie.
   - C1: pitch a product to a skeptical client / argue a position on a current issue.
   - C2: defend a contrarian opinion in a panel.
2. `tg_msg(type="text")`:

```
🎙️ 口语侦察 · 第 N 轮  难度：<level>  领域：<topic 中文标签>

场景：<中文一句话描述场景>
任务：<英文具体任务说明>

请直接发 30–45 秒的语音 🎤，不要写文字稿。
觉得太难直接说一句"换简单点"，下一轮自动降难度。
```

3. **WAIT** for voice. Read `stt` transcript.
4. Apply §3.2 rule. Adjust `level`. Next round.

Add R3 only if R1 vs R2 disagree by ≥ 1 band.

### State 4 — Reading (≥ 3 rounds, with domain rotation)

**Domain rotation**: R1 in-domain · R2 **non-domain (mandatory)** · R3 target boundary.

**Per round:**

1. Generate **passage (60–110 words)** at current `level`. Topic per rotation rule.
2. Pose **one open-ended question** needing a 1–2 English-sentence answer. Avoid yes/no.
3. `tg_msg(type="text")` with passage + question + footer:

```
📖 用 1–2 句英文作答；不要直接抄原文。
看不懂回 "看不懂"，自动降难度。
```

4. **WAIT** for typed answer.
5. Apply §3.3 rule. Adjust `level`. Next round.

**Stop**: same as Listening — 2 consecutive matching signals AND R1 ↔ R2 within 0.5 band, else R4 tie-break.

### State 5 — Writing (1 round, non-domain prompt)

1. Pick a **non-domain** prompt at current Reading-level (forces general productive testing):
   - A2: "Describe what you usually do on a Saturday."
   - B1: "Briefly recommend a movie or book to a friend and explain why."
   - B2: "Briefly explain a recent decision you made (work or personal) and why."
   - C1: "Argue for or against working from home in 4–5 sentences."
   - C2: "Defend an unpopular opinion you hold, in 5 sentences."
2. Ask for **3–5 English sentences**. `tg_msg(type="text")`.
3. **WAIT** for typed answer.
4. Apply §3.4 rule. Final writing level = average of (Reading-derived level baseline) and (Writing signal-derived adjustment).

### State 6 — Final Report

#### 6.1 Compute confidence per dimension

- `high`: ≥ 3 rounds completed (≥ 2 for Speaking); two consecutive signals match; non-domain probe within 0.5 band of in-domain; zero opt-out / Chinese-dominant / copy-paste / limited-evidence flags.
- `medium`: minor signal inconsistency, OR exactly one of the flags above.
- `low`: ≥ 2 flags, OR non-domain probe ≥ 1 band below in-domain, OR fewer than the minimum rounds completed for the dimension, OR Round 2 non-domain probe was skipped.

#### 6.2 Output schema per dimension

For each of Listening / Speaking / Reading / Writing / Vocab produce:

```
<dimension>:
  general_level: <CEFR sub-band, derived from non-domain probe(s)>
  domain_level:  <CEFR sub-band, derived from in-domain probe(s)>
  confidence:    <high | medium | low>
```

Vocab additionally carries `size_estimate: <approx word count>`.

#### 6.3 Memory write (`memory` tool)

Update `MEMORY.md`:

- `Band Snapshot.Overall`: weighted avg of the 5 `general_level` values (CEFR sub-band string, e.g. `A2+ → B1-`).
- Per dimension, write `general_level / domain_level / confidence` (do **not** collapse to a single CEFR).
- Listening / Reading are receptive skills; Speaking / Writing are productive skills — note this explicitly under each dimension.
- `Vocab.size_estimate`: numeric.
- `Coaching.recommended_difficulty`: weighted `general_level` (NOT `domain_level`) — this is the i+1 anchor for downstream skills.
- `Weak Spots`: 1–2 lowest dimensions OR most degraded under speed.
- `Strong Dimensions`: highest 1.
- `Profile Confidence`: lowest confidence among the 5 dimensions.

#### 6.4 Render report

Send as natural markdown reply (framework auto-converts to Telegram HTML). Format:

```markdown
# 🏆 Spy Scanner · 极速体检报告

**🎯 CEFR 通用定级：** <general overall, e.g. A2+>  ·  熟悉领域可达 <domain overall, e.g. B1>
**📚 预估核心词汇量：** <e.g. 3000 – 4000 词>
**🔍 体检置信度：** <high / medium / low> — <一句话原因，例如「中文回答较多，置信度中等」>

## 🕷️ 多维能力雷达

- **👂 听力 (Listening · 接收型):** <general> / 熟悉领域 <domain>  ·  <X/10>  —  <一句中文点评>
- **🗣️ 口语 (Speaking · 产出型):** <general> / 熟悉领域 <domain>  ·  <X/10>  —  <一句中文点评>
- **📖 阅读 (Reading · 接收型):** <general> / 熟悉领域 <domain>  ·  <X/10>  —  <一句中文点评>
- **✍️ 写作 (Writing · 产出型):** <general>  ·  <X/10>  —  <一句中文点评>
- **🔤 词汇 (Vocab):** ~<size> 词  ·  <X/10>  —  <一句中文点评>

## 🔍 任务报告 (Mission Debrief)

- **🌟 你的绝对优势：** <一句话>
- **🚧 最大短板：** <一针见血>
- **🚀 下一步行动：**
  1. <最该攻克的问题>
  2. <推荐 1 个匹配 general_level + 1 的具体训练 skill>

输入 `开始训练` 让 Anya 直接派发第一项任务 🕵️‍♀️
```

End the turn after sending the report. Do not auto-chain to `planner`.

## 5. Anti-Hallucination Reminders

- Execute **one state action per turn**, then STOP. Wait for the user.
- Never simulate / pre-fill the user's reply.
- Track per dimension across turns: `level`, `signal_history`, `domain_used` (`in / non`), `flags` (chinese_dominant / copy_paste / opt_out / replay_used / limited_evidence). Do not lose them between probes.
- The 3-round minimum is non-negotiable for Vocab / Listening / Reading.
- **Domain rotation Round 2 is mandatory** for Listening / Speaking / Reading. Skipping forces `confidence = low`.
- Output schema MUST be the 3-tuple `{general_level, domain_level, confidence}` per dimension. Do not collapse to a single CEFR for MEMORY writes.
- Recognise Chinese opt-out vocabulary (§2.3) as signals, not answers — never echo `skip` or other English opt-out words back to the user.
- Final report rendered via plain markdown (framework auto-converts to Telegram HTML).
- Button strings: `label|callback` with NO spaces around the pipe (e.g. `"🚀 出发！开始体检|start_vocab"`).
