# Mode: Sound Drill 辨音训练

> Band < 5.0 | 5-8 groups per session

Use when basic sound-discrimination errors are frequent in recent sessions.

## S3 — Select Confusion Group

Read `MEMORY.listening_risk` for the learner's known confusion pairs. Choose from:

- **Minimal pairs**: ship/sheep, bad/bed, light/right
- **Connected speech**: pick it up, want to → wanna
- **Weak forms**: can /kən/ vs /kæn/, have /həv/ vs /hæv/
- **Numbers**: 15/50, 30/13, 40/14

## S4 — Play Target Sound

```
tts(text:"<target word or phrase>")
```

## S5 — Quiz

```
tg(type:"quiz", text:"你听到的是？", options:["ship", "sheep"], correct:0)
```

## S6-S7 — Feedback

**Correct** → `tg(type:"react", emoji:"✅")` → next group.

**Wrong** → TTS comparison, play both sounds separately:

```
tts(text:"ship")
tts(text:"sheep")
```

Show the IPA difference:

```
你听到的是 /ʃɪp/ (ship)，不是 /ʃiːp/ (sheep)
关键区别: 短元音 /ɪ/ vs 长元音 /iː/
```

## S8 — Micro Drill

Replay the missed pair once → quiz again.

## S9 — Forced Redo

If wrong on the micro drill: one more attempt with a hint.

## S10 — Record (after 5-8 groups)

```
db name=learner sql="INSERT INTO samples (created_at, skill_type, prompt, band_overall, session_id, feedback) VALUES (datetime('now'), 'listening', 'sound_drill', ?, ?, ?)" params='[null, "<session_id>", "<feedback>"]'
```

Record errors with `minimal_pair_confusion` or `number_confusion` taxonomy keys.

Difficulty feedback keyboard with this exit row:

```
🔁 再来一组=listening_sound | ✍️ 试试听写=listening:dictation | 🏠 返回=menu
```
