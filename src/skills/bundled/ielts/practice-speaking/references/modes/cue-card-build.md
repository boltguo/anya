# Mode: Cue Card Build 提纲构建

> Band 5.0-6.0 | Medium scaffolding | Part 2 structured preparation

Use when Part 2 coverage is below 60% in recent sessions.

## S3 — Generate Cue Card

Generate a Part 2 cue card with 4 bullet points.

## S4 — Outline First (NOT speaking yet)

```
tg(type:"force_reply", text:"📋 先不要开始说！\n\n请先列出你的4个要点（中英文都行）：\n1. where/when\n2. what happened\n3. who was involved\n4. why it matters")
```

## S5a — Check Outline

Evaluate outline coverage. If a key point is missing, push for specificity:

```
tg(type:"force_reply", text:"你的第3点可以再具体一些 — 当时有谁在场？")
```

## S5b — Main Speaking Task

```
tg(type:"force_reply", text:"好，现在根据你的提纲说 1-2 分钟\n🎤 发语音")
```

## S6 — Score (4D)

Score Fluency & Coherence, Pronunciation, Lexical, Grammar.
Also note: coverage of all 4 outline points, time length, transition naturalness.

## S7 — Feedback

1 structural improvement + 1 language improvement.

## S8 — Micro Drill

Extract the weakest transition → provide a high-band connector → TTS demo.

## S9 — Forced Redo

```
tg(type:"force_reply", text:"重说你最弱的那个部分，用上 <connector>")
```

## S10 — Record

```
db name=learner sql="INSERT INTO samples (created_at, skill_type, prompt, band_overall, session_id) VALUES (datetime('now'), 'speaking', 'cue_card_build', ?, ?)" params='[null, "<session_id>"]'
```

Difficulty feedback keyboard.
