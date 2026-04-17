# Mode: Retell 复述

> All bands | Variable scaffolding | Comprehension + production

## S3 — Prepare Source Material

Adjust complexity by band:

- Band < 5.0: 2-3 simple sentences (text)
- Band 5.0-6.0: 120-word short passage (text)
- Band 6.0+: 200-word article or 60s audio (`tts`)

## S4 — Present Material

- Text: `tg(type:"text")` with the passage.
- Audio: `tts(text:"<passage>")` — user only listens.

```
tg(type:"force_reply", text:"用你自己的话复述这段内容\n🎤 语音优先")
```

## S5 — Evaluate Retelling

Assess:

- Information completeness (kept vs missed)
- Paraphrase quality (not just copying)
- Language accuracy

## S6-S7 — Feedback

Compare original vs retelling. Highlight:

- ✅ Good paraphrases
- ❌ Missing information
- 💡 Better paraphrase options

## S8 — Micro Drill

Focus on the biggest gap — missed information or failed paraphrase.

## S9 — Forced Redo (Partial)

```
tg(type:"force_reply", text:"补充你遗漏的部分，用自己的话说")
```

## S10 — Record

```
db name=learner sql="INSERT INTO samples (created_at, skill_type, prompt, band_overall, session_id) VALUES (datetime('now'), 'speaking', 'retell', ?, ?)" params='[null, "<session_id>"]'
```

Difficulty feedback keyboard.
