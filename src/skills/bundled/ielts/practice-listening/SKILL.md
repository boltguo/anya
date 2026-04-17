---
name: practice-listening
description: 'IELTS listening: 6-mode decoding system with dictation, sound drill, note-taking, cognitive error analysis, ext-listening, subcap profiling'
---

# Listening Trainer — 6-Mode Decoding System

## Pedagogical Foundation

- **Krashen i+1**: Audio difficulty matched to current band; ext-listening at 95%+ vocabulary coverage
- **Ericsson Deliberate Practice**: Error cause analysis drives targeted re-listening
- **Schmidt Noticing**: Transcript delay forces learner to notice decoding gaps
- **Nation Extensive Input**: ext-listening mode for building automatic processing speed
- **Shadowing (Arguelles)**: Shared with speaking module for pronunciation + comprehension co-training

## When to Use

- Learner says "听力", "listening", "练听力", "学听力"
- Callback: `listening` or any `listening:*` mode callback
- Reply Keyboard tap: "🎧 听力"

## Data

All session, error, and band data live in `learner.db` (tables `samples` + `errors` + `subcap_scores`).
Write through the `db` tool only — no JSON sidecar files.

Useful queries:

```
# Recent listening sessions
db name=learner sql="SELECT id, created_at, band_overall FROM samples WHERE skill_type='listening' ORDER BY created_at DESC LIMIT 5"

# Top recurring listening errors
db name=learner sql="SELECT recurrence_key, category, COUNT(*) as count FROM errors e JOIN samples s ON e.sample_id=s.id WHERE s.skill_type='listening' GROUP BY recurrence_key ORDER BY count DESC LIMIT 10"

# Inject 3 transferable challenge words for a topic
db name=vocab sql="SELECT word, definition FROM words WHERE topics LIKE ? AND mastery IN ('learning','known') AND transfer_level >= 2 ORDER BY is_user_word DESC, priority DESC, srs_due ASC LIMIT 3" params='["%<topic>%"]'
```

If a column is unfamiliar, call `db name=learner` (no sql) for a full schema dump.

## Mode Matrix → Reference Files

| Mode              | Band    | Audio Type          | Tools                            | Callback                       | load_score | Reference                              |
| ----------------- | ------- | ------------------- | -------------------------------- | ------------------------------ | ---------- | -------------------------------------- |
| **Sound Drill**   | < 5.0   | Word/phrase pairs   | `tts` + `quiz`                   | `listening_sound`              | 2          | `references/modes/sound-drill.md`      |
| **Dictation**     | 4.5-6.0 | 8-25 word sentences | `tts` + `force_reply` + diff     | `listening:dictation`          | 2          | `references/modes/dictation.md`        |
| **Short Clip**    | 5.0-6.0 | 40-80s dialogue     | `tts` + `force_reply` + spoiler  | `listening:clip`               | 3          | `references/modes/short-clip.md`       |
| **Question Type** | All     | Task-specific       | `tts` + `quiz` + `force_reply`   | `listening:type`               | 3          | `references/modes/question-type.md`    |
| **Lecture**        | 6.0+    | 90-180s academic    | `tts` + `force_reply` + keyboard | `listening` (default for 6.0+) | 4          | `references/modes/lecture.md`          |
| **Note-Taking**   | 5.5+    | 90-180s academic    | `tts` + `force_reply`            | `listening:notetaking`         | 3          | `references/modes/note-taking.md`      |
| **Ext-Listening** | All     | 3-5 min interest-based | `tts`                         | `listening:ext`                | 1          | (inline below)                         |

Load before executing:

```
skill_view name=practice-listening file=references/modes/<mode>.md
```

Auxiliary: `references/tts.md` — voice choices, dialogue mode, rate guidelines.

## Universal Workflow

### S1 — Context Load

1. `memory target=user action=read` → interests
2. `memory target=memory action=read` → current listening band, `listening_risk`, Path type, Daily Load remaining
3. Recent listening samples + top errors (queries above)

### S2 — Mode Selection

If callback is `listening:<mode>` → use that mode directly. Otherwise apply auto-selection:

1. Basic sound discrimination errors frequent → **Sound Drill**
2. Function-word / sentence-structure errors → **Dictation**
3. Specific question type consistently wrong → **Question Type Drill**
4. `note_taking_breakdown` in recent errors → **Note-Taking** mode
5. Overall stable → rotate **Short Clip** / **Lecture**
6. If Daily Load remaining < mode's load_score → suggest **Ext-Listening** (load_score=1)
7. Every week: at least 1 Dictation session (all levels)

Show recommended mode + allow override:

```
[KEYBOARD:
🎯 推荐: 听写=listening:dictation
🔊 辨音=listening_sound | 🎧 短音频=listening:clip
📝 题型=listening:type | 📖 笔记=listening:notetaking
📖 泛听=listening:ext | 🏠 返回=menu
]
```

### S3-S10 — Per Mode

Read the corresponding `references/modes/<mode>.md`, then execute its S3-S10. Each mode reference is self-contained.

## Cognitive Process Error Classification (Six Categories)

Every wrong answer must be classified into one of six cognitive error categories (PRD §8.3.3):

| Category | Taxonomy Key | Description | Root Cause |
|---|---|---|---|
| **Connected Speech** | `connected_speech_fail` | Linking, elision, weak forms not decoded | Language |
| **Academic Vocabulary** | `academic_vocab` (from listening subcap) | Word heard but meaning unknown | Language |
| **Sentence Parsing** | `sentence_anatomy_fail` | Grammar/structure too complex to process in real-time | Cognitive |
| **Discourse Marker** | `attitude_signal_miss` | Missed contrast/concession/attitude signal | Cognitive |
| **Inference** | `implied_meaning_fail` | Failed to infer unstated meaning | Cognitive |
| **Note-Taking** | `note_taking_breakdown` | Information lost due to note-taking strategy failure | Strategy |

When recording errors, tag with the appropriate category and always include the root cause classification.

### Enhanced Error Feedback Template

```
❌ 错误分析:
  📍 位置: "The research **on the contrary** suggests..."
  ❌ 你的理解: speaker agrees with the study
  ✅ 实际: speaker disagrees — "on the contrary" signals reversal
  🏷️ 类型: 转折信号漏抓 (attitude_signal_miss)
  🔍 根因: 认知层 — 语法知识够，但实时处理时遗漏

  📖 <tg-spoiler>完整原文: {{transcript}}</tg-spoiler>
```

## Sub-task Enhancements for Clip / Lecture Modes

In addition to comprehension questions, add these targeted sub-tasks:

### Discourse Marker Identification

After the main comprehension task, play a specific segment and ask:

```
tg(type:"quiz", text:"这段话里 'actually' 表达了什么？", options:["同意","纠正","惊讶","强调"], correct:1)
```

### Attitude Judgment

```
tg(type:"quiz", text:"说话者对这个政策的态度是？", options:["支持","反对","中立","不确定"], correct:<n>)
```

## Ext-Listening Mode (Inline — No Separate Reference)

**Load score: 1** — Low intensity, for daily habit building.

1. Select a 3-5 minute audio on a topic matching the learner's interests and current IELTS themes
2. Generate with `tts` at natural speed (no rate reduction)
3. Send audio + one simple question:

```
🎧 今日泛听 (5 min)
主题: {{topic}}

听完后告诉我: 这段话主要在讲什么？

[KEYBOARD:
💬 回答=listening:ext_answer | ⏭️ 跳过=practice
]
```

4. If learner responds: brief acknowledgment + record as sample with `skill_type='listening'`, `load_score=1`
5. No scoring, no error analysis, no forced redo — this is input accumulation only
6. Track completion for streak purposes

## Subcap Scoring (S10)

After every scored session, write subcap_scores:

```
db name=learner sql="INSERT INTO subcap_scores (sample_id, subcap_key, score, evidence, created_at) VALUES (?, ?, ?, ?, datetime('now'))"
```

Keys to evaluate:
- `listening.connected_speech` — from Sound Drill / Dictation error patterns
- `listening.academic_vocab` — from unknown words in Lecture / Clip
- `listening.discourse_marker` — from discourse marker sub-tasks
- `listening.implied_meaning` — from inference questions
- `listening.note_taking_stability` — from Note-Taking mode scores

## Telegram Interaction Style

- **Always generate audio.** Text-only listening defeats the purpose.
- **Send transcript AFTER answers.** Never before.
- **One audio + one question card.** No duplicates, no meta-messages.
- **`force_reply` for all transcription / answer input.** Avoids race conditions.
- **`quiz` for sound discrimination, paraphrase checks, MC questions.**
- **Spoiler tags (`<tg-spoiler>`)** for transcripts and translations the learner shouldn't see first.
- **`react` for lightweight ack** on a correct answer instead of full text.
- **Do NOT echo MEDIA: tags or `[[audio_as_voice]]` in text.** Audio is sent separately by the adapter.

## Difficulty Feedback Keyboard (Mandatory)

```
[KEYBOARD:
😰 太难了=feedback_too_hard | 👌 刚好=feedback_just_right | 🥱 太简单=feedback_too_easy
]
```

Plus a mode-specific exit row (see each mode's reference).

## Session Completion (S10 — All Modes)

After recording the sample, mark daily_task completed and persist difficulty feedback:

```
db name=learner sql="UPDATE daily_tasks SET completed = 1, completed_at = datetime('now'), sample_id = ? WHERE id = (SELECT id FROM daily_tasks WHERE date = date('now') AND skill = 'listening' AND completed = 0 LIMIT 1)" params='[<sample_id>]'
```

Persist difficulty feedback when learner taps button:

```
db name=learner sql="UPDATE samples SET feedback = json_set(COALESCE(feedback,'{}'), '$.difficulty', ?) WHERE id = ?" params='["just_right", <sample_id>]'
```

## Rules

1. **Two-listen approach** for Short Clip and Lecture modes.
2. **Cognitive error classification** (6 categories) for every wrong answer — not just "wrong".
3. **Translation tiering** by band level. Never give full translation to 6.5+ by default.
4. **Micro Drill + Forced Redo are mandatory.** S8 + S9 must happen (except ext-listening).
5. **Vary audio types**: conversation, monologue, lecture, interview.
6. **Progressive accent exposure**: Standard first, British/Australian for 6.5+.
7. **Record every session into `learner.db`** (S10) with subcap_scores.
8. **Ext-listening is input accumulation only.** No scoring, no pressure.
9. **Load score respected.** Low budget → suggest ext-listening or dictation.
