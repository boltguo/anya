---
name: listening
description: "IELTS listening practice: TTS audio drill, answer check, transcript"
version: "2.0.0"
metadatahermes:
  tags: [ielts, listening, audio, tts]
  category: anya
---

# Listening Trainer

## When to Use

- Learner says "听力", "listening", "练听力", "学听力"
- Callback: `ck:listening`
- Reply Keyboard tap: "🎧 听力"

## Data

Session saved to `~/.anya/data/ielts/learn/{timestamp}_listening.json` after completion.
Synced to `learner.db` via `tracker_db.py`.

## Workflow

### [ ] Step 1 — Assess & Plan

1. Read MEMORY.md → current listening band
2. Determine audio complexity:
   - Band 4-5: Slow, clear speech, simple vocabulary, short segments
   - Band 5-6: Normal speed, some complex vocabulary, medium segments
   - Band 6-7: Natural speed, academic vocabulary, longer segments, multiple speakers
3. Read USER.md → interests for topic selection
4. Choose audio type: conversation, monologue, lecture, or interview

### [ ] Step 2 — Vocabulary Injection

```bash
node vocab_db.js inject --topic <topic> --limit 3
```

### [ ] Step 3 — Generate Audio & Send

1. Write a script (conversation/monologue/lecture) with injected words
2. Generate TTS audio via Hermes `tts` tool
3. Send **one audio + one question card** only:

Send the audio as a voice message, then the question:

```text
🎧 **Listening Practice**

听完音频后回答以下问题：

1. What is the main topic of the conversation?
2. According to the speaker, what are the two main benefits?
3. Fill in: "The research suggests that ___ is essential for..."

✏️ 回复你的答案
```

**Critical**: Do NOT send the transcript yet. Do NOT send duplicate audio.

### [ ] Step 4 — Wait for Response

Learner sends answers as text.

### [ ] Step 5 — Check & Score

Concise accuracy feedback (not full 4D table):

```text
📊 **结果：2/3 正确**

1. ✅ 正确！
2. ❌ 你答的 "cost and speed"，正确答案是 "sustainability and accessibility"
   📍 关键原文：||"The two primary advantages are sustainability and accessibility..."||
3. ⚠️ 部分正确 — 缺少关键词 "fundamental"
```

### [ ] Step 6 — Transcript + Translation

**Only after the learner answers**, send the full transcript:

```text
📝 **原文 + 翻译**

||<full English transcript>

---

<full Chinese translation>||
```

Behind spoiler so learner can choose to reveal.

### [ ] Step 7 — Confusion Pairs (if applicable)

For sound-alike words (affect/effect, though/through):
- Show both words with IPA
- Generate TTS comparison audio

### [ ] Step 8 — Record to DB

```bash
node tracker_db.js add-sample \
  --skill-type listening \
  --prompt "..." --raw-content "learner answers" \
  --band-overall X.X

node tracker_db.js add-error \
  --sample-id <id> --recurrence-key <key> --category <cat> \
  --severity <low|medium|high> --original-phrase "..." --correction "..."
```

### [ ] Step 9 — Next Step

```text
[KEYBOARD:
🔁 再听一遍=ck:listening:replay | 🔁 下一题=ck:listening | ⬆️ 更难=ck:listening:harder | ⬇️ 更简单=ck:listening:easier
🏠 返回菜单=ck:menu
]
```

## Rules

1. **Always generate audio.** Text-only listening defeats the purpose.
2. **Send transcript AFTER answers.** Never before.
3. **One audio + one question card.** No duplicates, no meta-messages.
4. **Vary audio types**: conversation, monologue, lecture, interview.
5. **Progressive accent exposure**: Standard first, then British/Australian.
6. **Concise scoring.** Full 4D table only for assessments or when learner asks.
7. **Do NOT echo MEDIA: tags or [[audio_as_voice]] in text.** The audio is sent separately.
