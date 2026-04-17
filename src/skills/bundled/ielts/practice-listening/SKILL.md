---
name: practice-listening
description: 'IELTS listening: 5-mode decoding system with dictation, sound drill, error cause analysis'
---

# Listening Trainer — 5-Mode Decoding System

## When to Use

- Learner says "听力", "listening", "练听力", "学听力"
- Callback: `listening` or any `listening:*` mode callback
- Reply Keyboard tap: "🎧 听力"

## Data

All session, error, and band data live in `learner.db` (tables `samples` + `errors`).
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

| Mode              | Band    | Audio Type          | Tools                            | Callback                       | Reference                              |
| ----------------- | ------- | ------------------- | -------------------------------- | ------------------------------ | -------------------------------------- |
| **Sound Drill**   | < 5.0   | Word/phrase pairs   | `tts` + `quiz`                   | `listening_sound`              | `references/modes/sound-drill.md`      |
| **Dictation**     | 4.5-6.0 | 8-25 word sentences | `tts` + `force_reply` + diff     | `listening:dictation`          | `references/modes/dictation.md`        |
| **Short Clip**    | 5.0-6.0 | 40-80s dialogue     | `tts` + `force_reply` + spoiler  | `listening:clip`               | `references/modes/short-clip.md`       |
| **Question Type** | All     | Task-specific       | `tts` + `quiz` + `force_reply`   | `listening:type`               | `references/modes/question-type.md`    |
| **Lecture**       | 6.0+    | 90-180s academic    | `tts` + `force_reply` + keyboard | `listening` (default for 6.0+) | `references/modes/lecture.md`          |

Load before executing:

```
skill_view name=practice-listening file=references/modes/<mode>.md
```

Auxiliary: `references/tts.md` — voice choices, dialogue mode, rate guidelines.

## Universal Workflow

### S1 — Context Load

1. `memory target=user action=read` → interests
2. `memory target=memory action=read` → current listening band, `listening_risk`
3. Recent listening samples + top errors (queries above)

### S2 — Mode Selection

If callback is `listening:<mode>` → use that mode directly. Otherwise apply auto-selection:

1. Basic sound discrimination errors frequent → **Sound Drill**
2. Function-word / sentence-structure errors → **Dictation**
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

### S3-S10 — Per Mode

Read the corresponding `references/modes/<mode>.md`, then execute its S3-S10. Each mode reference is self-contained.

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

## Rules

1. **Two-listen approach** for Short Clip and Lecture modes.
2. **Error cause analysis** (missed / comprehension_gap / distractor_trap) for every wrong answer.
3. **Translation tiering** by band level. Never give full translation to 6.5+ by default.
4. **Micro Drill + Forced Redo are mandatory.** S8 + S9 must happen.
5. **Vary audio types**: conversation, monologue, lecture, interview.
6. **Progressive accent exposure**: Standard first, British/Australian for 6.5+.
7. **Record every session into `learner.db`** (S10).
