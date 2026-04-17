# Ext-Reading Mode — Extensive Reading for Stamina

## Pedagogical Foundation

- **Nation Extensive Input**: 95%+ vocabulary coverage for building automatic word recognition
- **Krashen i+1**: Material slightly above current level but mostly comprehensible
- **PRD §8.6**: Extension track — not for direct scoring, but for building "reading muscle"
- **Reading speed targets**: skim ≥ 250 wpm, detail ≥ 180 wpm

## When to Use

- `reading:ext` callback
- Good for low daily load budget (load_score = 1)
- Ideal for building reading habits without exam pressure
- Recommended: at least 2x per week in orchestrator schedule

## Load Score: 1

## Protocol

### S3 — Material Selection

Select a 400-800 word non-exam text that:
- Matches learner interests (from USER.md)
- Has 95%+ vocabulary coverage for the learner's current CEFR level
- Is NOT an IELTS passage — use adapted news articles, magazine features, popular science, or essay excerpts
- Is interesting enough to read for enjoyment

Sources to draw from (adapted):
- BBC Learning English level content
- TED talk transcripts (simplified if needed)
- Popular science summaries
- Opinion columns on current events

### S4 — Timed Reading

Present the article with a timer context:

```
📖 今日泛读 (约 10 分钟)

{{article_title}}

{{article_text}}

读完后回复 ✅，我会问你两个简单问题。

[KEYBOARD:
✅ 读完了=reading:ext_done | ⏭️ 跳过=practice
]
```

### S5 — Light Comprehension Check (2 questions only)

```
tg(type:"quiz", text:"这篇文章主要在讲什么？", options:["<option_a>","<option_b>","<option_c>","<option_d>"], correct:<n>)
```

```
tg(type:"quiz", text:"作者对 {{topic}} 的态度是？", options:["支持","反对","中立","没有表态"], correct:<n>)
```

### S6 — Brief Feedback (No Pressure)

If both correct:
```
tg(type:"react", emoji:"👍")
"Nice reading! 今天的泛读完成 ✅"
```

If wrong:
```
"没关系 — 泛读重点是习惯，不是分数。\n关键句在这里：\n<tg-spoiler>{{key_sentence}}</tg-spoiler>"
```

### S7-S9 — Skip

No Micro Drill or Forced Redo for ext-reading. This is pure input accumulation.

### S10 — Record (Minimal)

```
db name=learner sql="INSERT INTO samples (created_at, skill_type, prompt, raw_content, band_overall, session_id, load_score) VALUES (datetime('now'), 'reading', ?, '', null, ?, 1)" params='["ext-reading: <title>", "<session_id>"]'
```

No subcap_scores for ext-reading. No error tracking. Just log completion for streak.

Mark daily_task as completed if applicable.

## Exit Keyboard

```
[KEYBOARD:
📖 再来一篇=reading:ext | 📖 标准练习=reading | 🏠 返回=practice
]
```

## Rules

1. **No scoring pressure.** This is NOT a test.
2. **No forced redo.** The learner reads, answers 2 easy questions, done.
3. **95%+ vocabulary coverage** — if the text is too hard (estimated > 5% unknown words), simplify or swap.
4. **Interesting content** — this must feel like reading for enjoyment, not studying.
5. **10 minutes max** — keep it short and sustainable.
