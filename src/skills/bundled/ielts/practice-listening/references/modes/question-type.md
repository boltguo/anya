# Mode: Question Type Drill 题型专项

> All bands | Focus on a specific IELTS question type

Use when one specific question type is consistently wrong.

## S3 — Select Question Type

Choose from: Form completion / Multiple choice / Matching / Map labeling / Sentence completion.

If first time practicing this type → 30s strategy briefing first (S4).

## S4 — Strategy Briefing (first time only)

```
📝 **Form Completion 答题策略 (30s)**

1. 先看表格，预测答案类型（数字？名字？地点？）
2. 注意拼写 — 雅思听力拼写错误不给分
3. 注意单复数和大小写
```

## S5 — Play Audio + Questions

Generate audio targeting this question type. Send questions in the appropriate format.

## S6-S7 — Score + Type-Specific Feedback

Focus feedback on the question type's unique challenges (spelling for form completion, elimination for MC, etc.).

## S8-S9 — Micro Drill + Redo

Drill the type-specific skill. User re-answers after the drill.

## S10 — Record

```
db name=learner sql="INSERT INTO samples (created_at, skill_type, prompt, band_overall, session_id, feedback) VALUES (datetime('now'), 'listening', 'question_type', ?, ?, ?)" params='[null, "<session_id>", "<feedback>"]'
```

Difficulty feedback keyboard.
