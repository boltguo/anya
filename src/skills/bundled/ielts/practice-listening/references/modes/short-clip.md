# Mode: Short Clip 短音频理解

> Band 5.0-6.0 | 40-80s audio | Two-listen + error cause analysis

## S3 — Generate Audio Script

Write a 40-80s script (conversation / monologue / interview) that naturally injects target vocab.
Dialogues → `tts segments` with different voices. Monologues → simple `tts text`.

## S4 — First Listen: Gist

```
tts(text:"<full script>")
```

```
tg(type:"force_reply", text:"第1遍: 这段对话主要在说什么？")
```

Evaluate gist understanding.

## S5 — Second Listen: Detail

```
tts(text:"<full script>")
```

```
tg(type:"force_reply", text:"第2遍: 回答以下细节问题:\n1. ...\n2. ...\n3. ...")
```

## S6 — Score + Error Cause Analysis

Grade answers. For every wrong answer, classify the cause:

| Cause                              | Label               | Response                                |
| ---------------------------------- | ------------------- | --------------------------------------- |
| **A: Didn't hear it**              | `missed`            | Replay the key sentence segment via TTS |
| **B: Heard but didn't understand** | `comprehension_gap` | Explain the expression + collocations   |
| **C: Distractor trap**             | `distractor_trap`   | Compare distractor vs correct answer    |

## S7 — Transcript + Translation (Tiered)

| Band    | Strategy                                                     |
| ------- | ------------------------------------------------------------ |
| < 5.0   | Full transcript + full Chinese translation in `<tg-spoiler>` |
| 5.0-6.0 | Full transcript + key sentence translations only             |
| 6.5+    | Evidence line only + `[显示翻译\|show_translation]`         |

## S8 — Micro Drill

From wrong answers, extract 1 key sentence → dictation or paraphrase quiz.

## S9 — Forced Redo

User re-answers the wrong question after hearing the key sentence.

## S10 — Record

```
db name=learner sql="INSERT INTO samples (created_at, skill_type, prompt, band_overall, session_id, feedback) VALUES (datetime('now'), 'listening', 'short_clip', ?, ?, ?)" params='[null, "<session_id>", "<feedback>"]'
```

Record errors: `paraphrase_miss`, `distractor_trap`, `function_word_miss`, etc.

Difficulty feedback keyboard with this exit row:

```
🔁 再听一遍=listening_replay | 🔁 下一题=listening:clip | 🏠 返回=menu
```
