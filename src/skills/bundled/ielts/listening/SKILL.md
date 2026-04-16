---
name: listening
description: 'IELTS listening: 5-mode decoding system with dictation, sound drill, error cause analysis'
version: '3.0.0'
metadatahermes:
  tags: [ielts, listening, audio, tts, dictation, sound_drill]
  category: anya
---

# Listening Trainer — 5-Mode Decoding System

## When to Use

- Learner says "听力", "listening", "练听力", "学听力"
- Callback: `listening` or any `listening:*` mode callback
- Reply Keyboard tap: "🎧 听力"

## Data

Session saved to `~/.anya/data/ielts/learn/{timestamp}_listening.json` after completion.
Synced to `learner.db` via `tracker_db.js`.

## Mode Matrix

| Mode              | Band    | Audio Type          | Core Tools                       | Callback                          |
| ----------------- | ------- | ------------------- | -------------------------------- | --------------------------------- |
| **Sound Drill**   | < 5.0   | Word/phrase pairs   | `tts` + `quiz`                   | `listening_sound`              |
| **Dictation**     | 4.5-6.0 | 8-25 word sentences | `tts` + `force_reply` + diff     | `listening:dictation`          |
| **Short Clip**    | 5.0-6.0 | 40-80s dialogue     | `tts` + `force_reply` + spoiler  | `listening:clip`               |
| **Question Type** | All     | Task-specific       | `tts` + `quiz` + `force_reply`   | `listening:type`               |
| **Lecture**       | 6.0+    | 90-180s academic    | `tts` + `force_reply` + keyboard | `listening` (default for 6.0+) |

---

## Workflow — Universal Steps

### [ ] S1 — Context Load + Mode Selection

1. Read MEMORY.md → current listening band, listening_risk
2. Read USER.md → interests
3. Query `tracker_db.js list-samples --skill-type listening --limit 5`
4. Query `tracker_db.js list-errors --skill listening --limit 10`

**Auto Mode Selection Logic** (if no specific `listening:*` callback):

1. Basic sound discrimination errors frequent → **Sound Drill**
2. Function word / sentence structure errors → **Dictation**
3. Specific question type consistently wrong → **Question Type Drill**
4. Overall stable → rotate **Short Clip** / **Lecture**
5. Every week: at least 1 Dictation session (all levels)

Show recommended mode + allow override:

```
[KEYBOARD:
🎯 推荐: 听写=listening:dictation
🔊 辨音=listening_sound | 🎧 短音频=listening:clip
📝 题型=listening:type | 🏠 返回=menu
]
```

### [ ] S2 — Vocabulary Injection

```bash
node vocab_db.js inject --topic <topic> --limit 3
```

---

## Mode: Sound Drill 辨音训练

> Band < 5.0 | 5-8 groups per session

### [ ] S3 — Select Confusion Group

Read `MEMORY.listening_risk` for known confusion pairs. Choose from:

- **Minimal pairs**: ship/sheep, bad/bed, light/right
- **Connected speech**: pick it up, want to → wanna
- **Weak forms**: can /kən/ vs /kæn/, have /həv/ vs /hæv/
- **Numbers**: 15/50, 30/13, 40/14

### [ ] S4 — Play Target Sound

```
tts(text:"<target word or phrase>")
```

### [ ] S5 — Quiz

```
tg(type:"quiz", text:"你听到的是？", options:["ship", "sheep"], correct:0)
```

### [ ] S6-S7 — Feedback

**Correct** → `tg(type:"react", emoji:"✅")` → next group

**Wrong** → TTS comparison play both sounds separately:

```
tts(text:"ship")
tts(text:"sheep")
```

Show IPA difference:

```
你听到的是 /ʃɪp/ (ship)，不是 /ʃiːp/ (sheep)
关键区别: 短元音 /ɪ/ vs 长元音 /iː/
```

### [ ] S8 — Micro Drill

Replay the missed pair one more time → quiz again.

### [ ] S9 — Forced Redo

If wrong on micro drill: one more attempt with hint.

### [ ] S10 — Record

After 5-8 groups:

```bash
node tracker_db.js add-sample \
  --skill-type listening --mode sound_drill \
  --redo-count <N> --support-level high
```

Record errors with `minimal_pair_confusion` or `number_confusion` taxonomy keys.

```
[KEYBOARD:
😰 太难了=feedback_too_hard | 👌 刚好=feedback_just_right | 🥱 太简单=feedback_too_easy
🔁 再来一组=listening_sound | ✍️ 试试听写=listening:dictation | 🏠 返回=menu
]
```

---

## Mode: Dictation 听写

> Band 4.5-6.0 | 3-5 sentences per session

### [ ] S3 — Select Sentence

By band:

- Band 4.5-5.0: 8-12 words, simple structure
- Band 5.0-5.5: 12-18 words, one subordinate clause
- Band 5.5-6.0: 18-25 words, academic sentence

### [ ] S4 — First Listen

```
tts(text:"<target sentence>")
```

Natural speed, play once only.

```
tg(type:"force_reply", text:"写出你听到的完整句子")
```

### [ ] S5 — Word-by-Word Diff

Compare user's transcription with original. Classify errors:

- **Spelling**: correct word, wrong spelling
- **Function word miss**: articles, prepositions, auxiliaries omitted
- **Structure error**: word order wrong, words added/removed

Show highlighted diff:

```
📝 对比结果:
The library ~close~→**closes** at ~6~→**six** o'clock
⚠️ 注意: closes 第三人称单数 -s | 雅思听力要求 six 拼写
```

### [ ] S6 — Second Listen

```
tts(text:"<target sentence>")
```

```
tg(type:"force_reply", text:"再听一次，补充你漏掉的部分")
```

### [ ] S7 — Final Feedback

Show correct full text + key difficulty points.

If sentence involves paraphrase (synonym substitution):

```
tg(type:"quiz", text:"录音里的 essential 和题目的 necessary 是完美替换还是有差别？", options:["完美替换", "有细微差别"], correct:0)
```

### [ ] S8 — Micro Drill (Paraphrase)

If paraphrase involved: quiz on the synonym pair.
If not: replay the hardest segment for one more transcription.

### [ ] S9 — Forced Redo

User re-transcribes the sentence one final time.

### [ ] S10 — Record

After 3-5 sentences:

```bash
node tracker_db.js add-sample \
  --skill-type listening --mode dictation \
  --redo-count <N> --support-level medium
```

Record errors: `function_word_miss`, `spelling_error`, `connected_speech_fail`, etc.

Difficulty feedback keyboard.

---

## Mode: Short Clip 短音频理解 (Two-Listen + Error Cause Analysis)

> Band 5.0-6.0 | 40-80s audio

### [ ] S3 — Generate Audio Script

Write a 40-80s script (conversation/monologue/interview) with injected vocab.
Generate TTS audio.

### [ ] S4 — First Listen: Gist

```
tts(text:"<full script>")
```

```
tg(type:"force_reply", text:"第1遍: 这段对话主要在说什么？")
```

Evaluate gist understanding.

### [ ] S5 — Second Listen: Detail

```
tts(text:"<full script>")
```

```
tg(type:"force_reply", text:"第2遍: 回答以下细节问题:\n1. ...\n2. ...\n3. ...")
```

### [ ] S6 — Score + Error Cause Analysis

Grade answers. For each wrong answer, classify the error cause:

| Cause                              | Label               | Response                                |
| ---------------------------------- | ------------------- | --------------------------------------- |
| **A: Didn't hear it**              | `missed`            | Replay the key sentence segment via TTS |
| **B: Heard but didn't understand** | `comprehension_gap` | Explain the expression + collocations   |
| **C: Distractor trap**             | `distractor_trap`   | Compare distractor vs correct answer    |

### [ ] S7 — Transcript + Translation (Tiered)

| Band    | Strategy                                                     |
| ------- | ------------------------------------------------------------ |
| < 5.0   | Full transcript + full Chinese translation in `<tg-spoiler>` |
| 5.0-6.0 | Full transcript + key sentence translations only             |
| 6.5+    | Evidence line only + `[显示翻译\|show_translation]`       |

### [ ] S8 — Micro Drill

From wrong answers, extract 1 key sentence → dictation or paraphrase quiz.

### [ ] S9 — Forced Redo

User re-answers the wrong question after hearing the key sentence.

### [ ] S10 — Record

```bash
node tracker_db.js add-sample \
  --skill-type listening --mode short_clip \
  --audio-duration-sec <N> --redo-count <N> --support-level medium
```

Record errors: `paraphrase_miss`, `distractor_trap`, `function_word_miss`, etc.

```
[KEYBOARD:
😰 太难了=feedback_too_hard | 👌 刚好=feedback_just_right | 🥱 太简单=feedback_too_easy
🔁 再听一遍=listening_replay | 🔁 下一题=listening:clip | 🏠 返回=menu
]
```

---

## Mode: Question Type Drill 题型专项

> All bands | Focus on specific IELTS question types

### [ ] S3 — Select Question Type

Choose from: Form completion / Multiple choice / Matching / Map labeling / Sentence completion

If first time practicing this type → 30s strategy briefing first.

### [ ] S4 — Strategy Briefing (first time only)

```
📝 **Form Completion 答题策略 (30s)**

1. 先看表格，预测答案类型（数字？名字？地点？）
2. 注意拼写 — 雅思听力拼写错误不给分
3. 注意单复数和大小写
```

### [ ] S5 — Play Audio + Questions

Generate audio targeting this question type. Send questions in appropriate format.

### [ ] S6-S7 — Score + Type-Specific Feedback

Focus feedback on the question type's unique challenges.

### [ ] S8-S9 — Micro Drill + Redo

Drill on the type-specific skill (e.g., spelling for form completion, elimination for MC).

### [ ] S10 — Record

```bash
node tracker_db.js add-sample \
  --skill-type listening --mode question_type \
  --question-type <type> --redo-count <N>
```

Difficulty feedback keyboard.

---

## Mode: Lecture 讲座笔记

> Band 6.0+ | 90-180s academic audio | 2-3 speakers | 5-8 questions

### [ ] S3 — Generate Lecture

Academic topic, 90-180s, 2-3 speakers, natural pace.
Band 6.5+: consider non-standard accent (`tts(voice:"en-GB-RyanNeural")` or `tts(voice:"en-AU-NatashaNeural")`).

### [ ] S4-S5 — Two-Listen Approach

Same as Short Clip: gist first, then detail questions.

### [ ] S6-S10 — Same as Short Clip

Error cause analysis, tiered translation, micro drill, forced redo, recording.

Additional fields:

```bash
--speaker-count <N> --accent <standard|british|australian>
```

---

## Rules

1. **Always generate audio.** Text-only listening defeats the purpose.
2. **Send transcript AFTER answers.** Never before.
3. **One audio + one question card.** No duplicates, no meta-messages.
4. **Two-listen approach** for Short Clip and Lecture modes.
5. **Error cause analysis** (missed/comprehension_gap/distractor_trap) for every wrong answer.
6. **Translation tiering** by band level. Never give full translation to 6.5+ by default.
7. **Micro Drill + Forced Redo are mandatory.** No session ends without S8+S9.
8. **Difficulty feedback keyboard at every session end.**
9. **Vary audio types**: conversation, monologue, lecture, interview.
10. **Progressive accent exposure**: Standard first, then British/Australian for 6.5+.
11. **Do NOT echo MEDIA: tags or [[audio_as_voice]] in text.** Audio is sent separately.
