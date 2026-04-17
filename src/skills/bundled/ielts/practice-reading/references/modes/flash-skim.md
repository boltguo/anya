# Mode: Flash-Skimming 闪卡略读

> For learners who read word-by-word or translate everything.

Use when `speed_too_slow` appears in recent errors.

## S3 — Generate Paragraph

Generate a 100-150 word paragraph on a topic from USER.md interests.

## S4 — Timed Display

```
tg(type:"text", tag:"passage")
```

Show the paragraph with a timer notice: "⏱ 30秒后隐藏".

## S5 — Hide Content

After 30 seconds:

```
tg(type:"edit", message_id:"passage", text:"⏰ 时间到！段落已隐藏")
```

## S6 — Quiz

```
tg(type:"quiz", text:"这段话的 Heading 是？", options:["A: ...", "B: ...", "C: ...", "D: ..."], correct:N)
```

## S7 — Feedback

**Correct** → `tg(type:"react", emoji:"✅")` → next paragraph or wrap up.

**Wrong** → re-display the paragraph with key signal words highlighted:

```
重新看一下 — 关键信号词是: **however**, **primarily**, **in contrast**
这些词告诉你段落的主旨方向
```

## S8-S9 — Micro Drill + Redo

If wrong: another paragraph → timed display → quiz again (redo).

## S10 — Record

```
db name=learner sql="INSERT INTO samples (created_at, skill_type, prompt, band_overall, session_id) VALUES (datetime('now'), 'reading', 'flash_skim', ?, ?)" params='[null, "<session_id>"]'
```

Difficulty feedback keyboard.
