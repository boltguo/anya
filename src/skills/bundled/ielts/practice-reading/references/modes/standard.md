# Mode: Standard Practice (Enhanced)

> Regular training with band-scaled passages.

## S3 — Generate Passage + Questions

**Passage length by band:**

| Band    | Words   | Questions | Time Guidance        |
| ------- | ------- | --------- | -------------------- |
| 4.0-5.0 | ~200    | 3         | No time limit        |
| 5.0-6.0 | ~400    | 4         | 8 minutes suggested  |
| 6.0-6.5 | ~600    | 5         | 12 minutes suggested |
| 6.5+    | 600-900 | 6         | 15 minutes strict    |

**Question types** (vary across sessions, don't repeat 3x):

- T/F/NG (True/False/Not Given)
- Matching headings
- Form completion / fill-in-blank
- Short answer
- Multiple choice
- Sentence completion
- Matching information

Topics: environment, education, health, history, science, society, culture, economics.
Use USER.md engage topics when IELTS task allows. Push beyond comfort zone.

## S4 — Send Passage

```
📖 **Reading Practice** (约 <N> 词)

<passage text>

---

**Questions** (<N> 题)

1. [T/F/NG] According to the passage, ...
2. [Fill-in] The author suggests that ___ is ...
3. [MC] What is the main idea of paragraph 3?
   A) ...  B) ...  C) ...  D) ...
...

✏️ 回复你的答案，比如：1. True  2. environment  3. B
```

```
tg(type:"force_reply", text:"回复你的答案")
```

## S5 — Wait for Response

## S6 — Score + Error Analysis

```
📊 **结果：3/4 正确**

1. ✅ True — 正确！
2. ❌ 你答的 "society"，正确答案是 "environment"
   📍 关键句：<tg-spoiler>"The environmental impact was the primary concern..."</tg-spoiler>
3. ✅ B — 正确！
4. ⚠️ 部分正确 — 缺少关键词
```

## S7 — Translation (Tiered)

| Band    | Strategy                                                |
| ------- | ------------------------------------------------------- |
| < 5.5   | Full passage translation in `<tg-spoiler>`              |
| 5.5-6.0 | Key sentence translations only                          |
| 6.5+    | Evidence lines only + `[显示翻译\|show_translation]`   |

## S8 — Micro Drill: Sentence Anatomy (on wrong answers)

For each wrong answer, trigger Sentence Anatomy on the relevant sentence.
See `references/modes/sentence-anatomy.md`. If no wrong answers, skip to S10.

## S9 — Forced Redo

User re-answers the wrong question(s) after the sentence anatomy drill.

## S10 — Record

```
db name=learner sql="INSERT INTO samples (created_at, skill_type, prompt, band_overall, session_id) VALUES (datetime('now'), 'reading', 'standard', ?, ?)" params='[null, "<session_id>"]'

db name=learner sql="INSERT INTO errors (sample_id, recurrence_key, category, severity, original_phrase, correction) VALUES (?, ?, 'reading', ?, ?, ?)" params='[<sample_id>, "<key>", "<sev>", "...", "..."]'
```

Difficulty feedback keyboard with this exit row:

```
🔁 再来一篇=reading | ⬆️ 更难=reading_harder | ⬇️ 更简单=reading_easier | 🏠 返回=menu
```
