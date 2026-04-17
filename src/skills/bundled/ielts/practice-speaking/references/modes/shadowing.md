# Mode: Shadowing 跟读

> Band < 5.0 | Extreme scaffolding | 3-5 sentences per group

Use this when fluency < 4.0 and `MEMORY.pronunciation_weak` lists multiple entries.

## S3 — Select Target Sentence

1. Read `MEMORY.pronunciation_weak` to target the learner's specific weak sounds.
2. Pick a sentence (8-14 words) appropriate for band:
   - Band < 4.5: simple daily-life sentences
   - Band 4.5-5.0: one subordinate clause
3. The sentence MUST contain the targeted pronunciation challenge.

## S4 — Play Target Audio

```
tts(text:"<target sentence>", rate:"-15%")
```

Send text with spoiler so the learner cannot read first:

```
🎤 听完后跟读这个句子，发语音给我

<tg-spoiler><target sentence></tg-spoiler>
```

## S5 — Collect Voice + Assess

Wait for user voice → `pron_assess(audio_path, reference_text)`.
Parse result, find the word with the lowest accuracy score.

## S6-S7 — Focused Feedback (1 issue only)

Correct ONLY the #1 most important pronunciation issue:

- Stress error → mark correct stress + TTS comparison
- Connected speech → demonstrate the linking
- Dropped ending → highlight the missing sound

```
tts(text:"<correct version of problem word/phrase>")
```

Show IPA for the problem sound.

## S8 — Micro Drill: TTS Comparison

Replay correct version at normal speed:

```
tts(text:"<correct version>")
```

## S9 — Forced Redo

```
tg(type:"force_reply", text:"再跟读一次，注意 <specific issue>")
```

Wait for voice → `pron_assess` again → compare improvement vs first attempt.

## S10 — Record + Loop

```
db name=learner sql="INSERT INTO samples (created_at, skill_type, prompt, band_overall, session_id) VALUES (datetime('now'), 'speaking', 'shadowing', ?, ?)" params='[null, "<session_id>"]'
```

Record the pronunciation error with its taxonomy key.

Repeat S3-S10 for 3-5 sentences total, then show the standard difficulty feedback keyboard with this exit row:

```
🔁 再来一组=speaking:shadowing | 🗣️ 试试问答=speaking:qa | 🏠 返回=menu
```
