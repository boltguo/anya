---
name: speaking
description: 'IELTS speaking: 6-mode layered training with pron_assess, micro drill, forced redo'
version: '3.0.0'
metadatahermes:
  tags: [ielts, speaking, pronunciation, tts, pron_assess, shadowing]
  category: anya
---

# Speaking Coach — 6-Mode Training System

## When to Use

- Learner says "口语", "speaking", "练口语", "学口语"
- Callback: `ck:speaking` or any `ck:speaking:*` mode callback
- Reply Keyboard tap: "🗣️ 口语"

## Data

Session saved to `~/.anya/data/ielts/learn/{timestamp}_speaking.json` after completion.
Synced to `learner.db` via `tracker_db.js`.

## Mode Matrix

| Mode               | Band    | Scaffolding | Core Tools                       | Callback                |
| ------------------ | ------- | ----------- | -------------------------------- | ----------------------- |
| **Shadowing**      | < 5.0   | Extreme     | `tts` + `pron_assess`            | `ck:speaking:shadowing` |
| **Guided QA**      | 4.5-5.5 | High        | `tts` + `force_reply`            | `ck:speaking:qa`        |
| **Cue Card Build** | 5.0-6.0 | Medium      | `tts` + `force_reply`            | `ck:speaking:cuecard`   |
| **Role-play**      | 4.5-6.0 | Medium      | `tts` + multi-turn `force_reply` | `ck:speaking:roleplay`  |
| **Retell**         | All     | Variable    | `tts` + `pron_assess`            | `ck:speaking:retell`    |
| **Examiner Sim**   | 5.5+    | Low/None    | `tts` + `pron_assess`            | `ck:speaking:exam`      |

---

## Workflow — Universal Steps (All Modes)

### [ ] S1 — Context Load + Mode Selection

1. Read MEMORY.md → current speaking band, fluency, pronunciation_weak
2. Read USER.md → interests (engage topics)
3. Query `tracker_db.js list-samples --skill-type speaking --limit 5` → recent modes + scores
4. Query `tracker_db.js list-errors --skill speaking --limit 10` → recent error patterns

**Auto Mode Selection Logic** (if no specific `ck:speaking:*` callback):

1. `fluency < 4.0` AND `pronunciation_weak` has multiple entries → **Shadowing**
2. `answer_length` consistently below target in recent sessions → **Guided QA**
3. Part 2 coverage < 60% in last 2 sessions → **Cue Card Build**
4. 3 consecutive Examiner Sim sessions → **Retell** or **Role-play** (alternate)
5. Default → **Examiner Sim**

Show recommended mode + allow user override:

```
[KEYBOARD:
🎯 推荐: 跟读=ck:speaking:shadowing
🗣️ 问答=ck:speaking:qa | 🎤 考官=ck:speaking:exam
📋 提纲=ck:speaking:cuecard | 🎭 对话=ck:speaking:roleplay
🔄 复述=ck:speaking:retell
]
```

### [ ] S2 — Vocabulary Injection

```bash
node vocab_db.js inject --topic <topic> --limit 3
node vocab_db.js inject --transfer-level 2 --limit 2
```

Merge into challenge words for the session.

---

## Mode: Shadowing 跟读

> Band < 5.0 | Extreme scaffolding | 3-5 sentences per group

### [ ] S3 — Select Target Sentence

1. Read `MEMORY.pronunciation_weak` to target specific sounds
2. Pick sentence (8-14 words) appropriate for band:
   - Band < 4.5: Simple daily life sentences
   - Band 4.5-5.0: Sentences with one subordinate clause
3. Sentence should contain the target pronunciation challenge

### [ ] S4 — Play Target Audio

```
tts(text:"<target sentence>", rate:"-15%")
```

Send text with spoiler:

```
🎤 听完后跟读这个句子，发语音给我

<tg-spoiler><target sentence></tg-spoiler>
```

### [ ] S5 — Collect Voice + Assess

Wait for user voice message → `pron_assess(audio_path, reference_text)`

Parse result — find the word with lowest accuracy score.

### [ ] S6-S7 — Focused Feedback (1 issue only)

Only correct the **#1 most important** pronunciation issue:

- Stress error → mark correct stress + TTS comparison
- Connected speech → demonstrate the linking
- Dropped ending → highlight the missing sound

```
tts(text:"<correct version of problem word/phrase>")
```

Show IPA for the problem sound.

### [ ] S8 — Micro Drill: TTS Comparison

Play correct version at normal speed:

```
tts(text:"<correct version>")
```

### [ ] S9 — Forced Redo

```
tg(type:"force_reply", text:"再跟读一次，注意 <specific issue>")
```

Wait for voice → `pron_assess` second assessment → compare with first attempt.

### [ ] S10 — Record + Next

```bash
node tracker_db.js add-sample \
  --skill-type speaking --mode shadowing \
  --redo-count 1 --support-level high
```

Record pronunciation error with taxonomy key.

Repeat S3-S10 for 3-5 sentences, then show:

```
[KEYBOARD:
😰 太难了=ck:feedback:too_hard | 👌 刚好=ck:feedback:just_right | 🥱 太简单=ck:feedback:too_easy
🔁 再来一组=ck:speaking:shadowing | 🗣️ 试试问答=ck:speaking:qa | 🏠 返回=ck:menu
]
```

---

## Mode: Guided QA 引导问答

> Band 4.5-5.5 | High scaffolding | Part 1 style questions

### [ ] S3 — Generate Question

Generate Part 1 question based on USER.md engage topics.

### [ ] S4 — Send with Scaffolding

If band < 5.0, provide answer frame:

```
tg(type:"force_reply", text:"🗣️ <question>\n\n💡 You can say: 'I prefer ___ because ___'\n\n🎤 发语音或打字回答")
```

If band ≥ 5.0, no frame — just the question.

### [ ] S5 — Evaluate Response

Check:

- Completeness (not just Yes/No)
- Expansion (has because/for example)
- Grammar accuracy

If answer < 2 sentences:

```
tg(type:"force_reply", text:"Good start! Can you add one reason why?")
```

→ Wait for expansion → re-evaluate

### [ ] S6-S7 — Feedback

1 grammar/vocab correction + 1 expansion demonstration + TTS of correct version.

### [ ] S8 — Micro Drill

Extract the key error → provide a high-band alternative → TTS demo.

### [ ] S9 — Forced Redo

```
tg(type:"force_reply", text:"现在把整个回答重说一遍，注意用上 <correction>")
```

### [ ] S10 — Record + Feedback

```bash
node tracker_db.js add-sample \
  --skill-type speaking --mode guided_qa \
  --redo-count 1 --support-level high \
  --response-length-words <N>
```

```
[KEYBOARD:
😰 太难了=ck:feedback:too_hard | 👌 刚好=ck:feedback:just_right | 🥱 太简单=ck:feedback:too_easy
🔁 再来一题=ck:speaking:qa | ⬆️ 试试考官=ck:speaking:exam | 🏠 返回=ck:menu
]
```

---

## Mode: Cue Card Build 提纲构建

> Band 5.0-6.0 | Medium scaffolding | Part 2 structured preparation

### [ ] S3 — Generate Cue Card

Generate a Part 2 cue card with 4 bullet points.

### [ ] S4 — Outline First (NOT speaking yet)

```
tg(type:"force_reply", text:"📋 先不要开始说！\n\n请先列出你的4个要点（中英文都行）：\n1. where/when\n2. what happened\n3. who was involved\n4. why it matters")
```

### [ ] S5a — Check Outline

Evaluate outline coverage. If missing key points:

```
tg(type:"force_reply", text:"你的第3点可以再具体一些 — 当时有谁在场？")
```

### [ ] S5b — Main Speaking Task

```
tg(type:"force_reply", text:"好，现在根据你的提纲说 1-2 分钟\n🎤 发语音")
```

### [ ] S6 — Score

4D scoring: Fluency & Coherence, Pronunciation, Lexical, Grammar.
Evaluate: coverage of all 4 points, time length, transition naturalness.

### [ ] S7 — Feedback

1 structural improvement + 1 language improvement.

### [ ] S8 — Micro Drill

Extract weakest transition → provide high-band connector → TTS demo.

### [ ] S9 — Forced Redo

```
tg(type:"force_reply", text:"重说你最弱的那个部分，用上 <connector>")
```

### [ ] S10 — Record

```bash
node tracker_db.js add-sample \
  --skill-type speaking --mode cue_card_build \
  --redo-count 1 --support-level medium
```

Difficulty feedback keyboard.

---

## Mode: Role-play 对话练习

> Band 4.5-6.0 | Medium scaffolding | 4-6 turn natural dialogue

### [ ] S3 — Set Scene

Pick a life scenario (based on USER.md interests):

- 生活: 咖啡店点餐 / 向同事介绍周末 / 帮朋友推荐电影 / 旅行问路
- 工作: 会议讨论 / 项目汇报 / 同事聊天
- 学术: 选课咨询 / 图书馆 / 导师沟通

```
🎭 **Role-play: 咖啡店点餐**

我是咖啡店店员，你来点单。
Ready? I'll start:

"Hi there! Welcome to Bean & Brew. What can I get for you today?"

🎤 发语音或打字回答
```

### [ ] S4-S5 — Multi-turn Dialogue (4-6 turns)

System plays the other role. Each turn uses `tg(type:"force_reply")`.
Maintain natural conversation flow. Introduce small complications (e.g., "Sorry, we're out of oat milk today").

### [ ] S6 — Post-dialogue Feedback

After 4-6 turns, provide unified feedback:

- Expression naturalness
- Grammar accuracy
- Conversation maintenance ability

### [ ] S7 — Highlight

1-2 good expressions + 1-2 improvements needed.

### [ ] S8 — Micro Drill

Extract 1 awkward expression → provide natural alternative → TTS.

### [ ] S9 — Forced Redo

```
tg(type:"force_reply", text:"重说你第3轮的回答，用更自然的表达")
```

### [ ] S10 — Record

```bash
node tracker_db.js add-sample \
  --skill-type speaking --mode roleplay \
  --redo-count 1 --support-level medium
```

Difficulty feedback keyboard.

---

## Mode: Retell 复述

> All bands | Variable scaffolding | Comprehension + production

### [ ] S3 — Prepare Source Material

Adjust complexity by band:

- Band < 5.0: 2-3 simple sentences (text)
- Band 5.0-6.0: 120-word short passage (text)
- Band 6.0+: 200-word article or 60s audio (`tts`)

### [ ] S4 — Present Material

Text: `tg(type:"text")` with the passage.
Audio: `tts(text:"<passage>")` — user listens only.

```
tg(type:"force_reply", text:"用你自己的话复述这段内容\n🎤 语音优先")
```

### [ ] S5 — Evaluate Retelling

Assess:

- Information completeness (what was kept/missed)
- Paraphrase quality (not just copying)
- Language accuracy

### [ ] S6-S7 — Feedback

Compare original vs retelling. Highlight:

- ✅ Good paraphrases
- ❌ Missing information
- 💡 Better paraphrase options

### [ ] S8 — Micro Drill

Focus on the biggest gap — missed information or failed paraphrase.

### [ ] S9 — Forced Redo (Partial)

```
tg(type:"force_reply", text:"补充你遗漏的部分，用自己的话说")
```

### [ ] S10 — Record

```bash
node tracker_db.js add-sample \
  --skill-type speaking --mode retell \
  --redo-count 1 --support-level <varies>
```

Difficulty feedback keyboard.

---

## Mode: Examiner Sim 考官模拟 (Enhanced)

> Band 5.5+ | Low/No scaffolding | Full exam simulation with follow-ups

### [ ] S3 — Select Part + Topic

Decide Part type (don't repeat consecutively):

- **Part 1** (4-5 min): Familiar topics — home, work, hobbies. 3 questions + 1-2 follow-ups.
- **Part 2** (3-4 min): Cue card — 1 min prep + 1-2 min answer.
- **Part 3** (4-5 min): Abstract discussion linked to Part 2. 2-3 layers of progressive follow-ups.

### [ ] S4 — Send Prompt

```
🗣️ **Speaking Part X**

<question/cue card>

⏱ <time guidance>
💡 试试用：<challenge words>

🎤 发语音或者打字回答都可以
```

### [ ] S5 — Collect Response + Follow-up

After initial response:

If band ≥ 6.5 → **aggressive follow-up**:

```
"However, doesn't that contradict...? How would you respond to someone who says...?"
```

If band < 6.5 → **gentle follow-up**:

```
"Can you give me a specific example?"
```

Wait for follow-up response.

### [ ] S6 — 4D Scoring + Behavioral Metrics

| Criterion                | Score   |
| ------------------------ | ------- |
| Fluency & Coherence      | X.0     |
| Pronunciation            | X.0     |
| Lexical Resource         | X.0     |
| Grammar Range & Accuracy | X.0     |
| **Overall**              | **X.0** |

Additional behavioral metrics (for tracking):

- `answer_length_seconds`
- `pause_count` (estimated from response)
- `self_correction_count`
- `filler_usage` (um, uh, like, you know)

### [ ] S7 — Focused Feedback

Top 2 errors with:

- ❌ Original phrase
- ✅ Corrected version + IPA for pronunciation errors
- 💬 Brief explanation
- Band-Up example: current sentence → +1.0 band version

TTS of corrected expressions.

### [ ] S8 — Micro Drill

Extract the stumble point → provide high-band sentence pattern:

```
"试试用这个句型: 'While it is true that..., we cannot overlook the fact that...'"
```

`tts` plays the pattern.

### [ ] S9 — Forced Redo

```
tg(type:"force_reply", text:"用这个句型重说一遍你刚才卡住的部分")
```

Wait for voice → `pron_assess(audio_path, reference_text)` → compare.

### [ ] S10 — Record

```bash
node tracker_db.js add-sample \
  --skill-type speaking --mode examiner_sim \
  --redo-count 1 --support-level none \
  --duration-sec <N> --response-length-words <N>

node tracker_db.js add-error \
  --sample-id <id> --recurrence-key <key> --category <cat> \
  --severity <sev> --original-phrase "..." --correction "..."
```

```
[KEYBOARD:
😰 太难了=ck:feedback:too_hard | 👌 刚好=ck:feedback:just_right | 🥱 太简单=ck:feedback:too_easy
🔁 继续=ck:speaking | 📊 看报告=ck:assessment | 🏠 返回=ck:menu
]
```

---

## Upgrade / Downgrade Rules

### Upgrade (meet any 2):

- 3 consecutive sessions reaching 80%+ of target answer length
- Fluency/Grammar scores meet target band for 2 consecutive sessions
- Maintains coherence under follow-up pressure

### Downgrade (meet any 2):

- Answer length consistently below 50% of target
- Same topic causes breakdown 2 consecutive times
- Errors so frequent they impair comprehension

### Downgrade behavior:

- Naturally switch to a lower-tier mode (e.g., Examiner Sim → Guided QA)
- Next session starts with a Shadowing warm-up
- **Never say "you've been downgraded"** — frame it as variety

---

## Rules

1. **Accept both voice and text.** Never reject text input. Voice is preferred.
2. **Always provide TTS for corrections.** The learner needs to hear the right pronunciation.
3. **pron_assess for all voice input** in Shadowing and Examiner Sim modes.
4. **IPA for pronunciation fixes.** Always show IPA alongside TTS.
5. **Micro Drill + Forced Redo are mandatory.** No session ends without S8+S9.
6. **Difficulty feedback keyboard at every session end.** No exceptions.
7. **No text reply alongside force-reply prompts.** Avoids race conditions.
8. **Mode variety**: Don't run the same mode 3+ times consecutively.
9. **Challenge words**: Inject recently learned L2+ vocabulary as challenge words.
