# Mode: Guided QA 引导问答

> Band 4.5-5.5 | High scaffolding | Part 1 style questions

Use when answer length is consistently below target.

## S3 — Generate Question

Generate a Part 1 question based on USER.md engage topics.

## S4 — Send with Scaffolding

If band < 5.0, provide an answer frame so the learner has a hook:

```
tg(type:"force_reply", text:"🗣️ <question>\n\n💡 You can say: 'I prefer ___ because ___'\n\n🎤 发语音或打字回答")
```

If band ≥ 5.0, drop the frame — just the question.

## S5 — Evaluate Response

Check three dimensions:

- Completeness (not Yes/No)
- Expansion (has because / for example)
- Grammar accuracy

If answer < 2 sentences, push for expansion before moving on:

```
tg(type:"force_reply", text:"Good start! Can you add one reason why?")
```

→ wait → re-evaluate.

## S6-S7 — Feedback

1 grammar/vocab correction + 1 expansion demonstration + TTS of the correct version.

## S8 — Micro Drill

Extract the key error → provide a high-band alternative → TTS demo.

## S9 — Forced Redo

```
tg(type:"force_reply", text:"现在把整个回答重说一遍，注意用上 <correction>")
```

## S10 — Record

```
db name=learner sql="INSERT INTO samples (created_at, skill_type, prompt, band_overall, session_id) VALUES (datetime('now'), 'speaking', 'guided_qa', ?, ?)" params='[null, "<session_id>"]'
```

Difficulty feedback keyboard with this exit row:

```
🔁 再来一题=speaking:qa | ⬆️ 试试考官=speaking:exam | 🏠 返回=menu
```
