---
name: reading
description: 'IELTS reading: flash-skimming, sentence anatomy, band-scaled passages + micro drill'
version: '3.0.0'
metadatahermes:
  tags: [ielts, reading, comprehension, skimming, sentence_anatomy]
  category: anya
---

# Reading Trainer — Speed + Sentence Anatomy System

## When to Use

- Learner says "阅读", "reading", "练阅读", "学阅读", "看文章"
- Callback: `reading` or any `reading:*` mode callback
- Reply Keyboard tap: "📖 阅读"

## Data

Session saved to `~/.anya/data/ielts/learn/{timestamp}_reading.json` after completion.
Synced to `learner.db` via `tracker_db.js`.

## Mode Matrix

| Mode                  | Use Case                                      | Core Interaction                      | Callback              |
| --------------------- | --------------------------------------------- | ------------------------------------- | --------------------- |
| **Flash-Skimming**    | Reading too slow / word-by-word translation   | Timed display → hide → quiz           | `reading_skim`     |
| **Sentence Anatomy**  | Long sentence breakdown / T/F/NG logic errors | Socratic questioning → force_reply    | `reading_anatomy`  |
| **Standard Practice** | Regular training                              | Band-scaled passage + mixed questions | `reading`          |
| **Timed Exam**        | Exam prep                                     | 900 words + 15-min strict cutoff      | (advanced, band 6.5+) |

---

## Workflow

### [ ] S1 — Context Load + Mode Selection

1. Read MEMORY.md → current reading band, reading pace
2. Read USER.md → interests
3. Query `tracker_db.js list-samples --skill-type reading --limit 5`
4. Query `tracker_db.js list-errors --skill reading --limit 10`

**Auto Mode Selection**:

- `speed_too_slow` in recent errors → **Flash-Skimming**
- `sentence_anatomy_fail` or `tfng_logic_error` frequent → **Sentence Anatomy** (triggered after wrong answers)
- Default → **Standard Practice**

### [ ] S2 — Vocabulary Injection

```bash
node vocab_db.js inject --topic <topic> --limit 3
```

---

## Mode: Flash-Skimming 闪卡略读

> For learners who read word-by-word or translate everything

### [ ] S3 — Generate Paragraph

Generate a 100-150 word paragraph on a topic from USER.md interests.

### [ ] S4 — Timed Display

```
tg(type:"text", tag:"passage")
```

Show the paragraph with a timer notice: "⏱ 30秒后隐藏"

### [ ] S5 — Hide Content

After 30 seconds:

```
tg(type:"edit", message_id:"passage", text:"⏰ 时间到！段落已隐藏")
```

### [ ] S6 — Quiz

```
tg(type:"quiz", text:"这段话的 Heading 是？", options:["A: ...", "B: ...", "C: ...", "D: ..."], correct:N)
```

### [ ] S7 — Feedback

**Correct** → `tg(type:"react", emoji:"✅")` → next paragraph or wrap up.

**Wrong** → Re-display the paragraph with key signal words highlighted:

```
重新看一下 — 关键信号词是: **however**, **primarily**, **in contrast**
这些词告诉你段落的主旨方向
```

### [ ] S8-S9 — Micro Drill + Redo

If wrong: show another paragraph → timed display → quiz again (redo).

### [ ] S10 — Record

```bash
node tracker_db.js add-sample \
  --skill-type reading --mode flash_skim \
  --redo-count <N> --support-level medium
```

Difficulty feedback keyboard.

---

## Mode: Sentence Anatomy 长难句解剖

> Triggered after wrong answers in Standard Practice, or via `reading_anatomy`

### [ ] S3 — Extract Problem Sentence

From the wrong answer, extract the long/complex sentence that caused the error.

### [ ] S4 — Display + Socratic Questioning

Show the sentence with clause layers annotated:

```
📝 来解剖这个长难句:

"The policy, [which was largely ignored by local authorities], resulted in significant changes [that affected millions of residents]."
```

First question (force_reply):

```
tg(type:"force_reply", text:"'which was largely ignored' 修饰的是谁？")
```

### [ ] S5 — Evaluate + Guide

**Correct** → Progress to deeper question:

```
tg(type:"force_reply", text:"整个句子的主语和核心谓语是什么？")
```

**Wrong** → Give hint:

```
tg(type:"force_reply", text:"试试把 which 从句去掉，剩下的部分是什么？")
```

### [ ] S6 — T/F/NG Logic Probe (if applicable)

If the original error was T/F/NG:

```
tg(type:"quiz", text:"题目用的是 'some'，原文用的是 'the majority'\n它们是绝对矛盾还是包含关系？", options:["绝对矛盾 (False)", "包含关系 (Not Given)"], correct:1)
```

### [ ] S7-S9 — Feedback + Redo

Explain the logic, then have the learner re-answer the original question.

### [ ] S10 — Record

Record error with `sentence_anatomy_fail` or `tfng_logic_error` taxonomy key.

---

## Mode: Standard Practice (Enhanced)

> Regular training with band-scaled passages

### [ ] S3 — Generate Passage + Questions

**Passage length by band:**

| Band    | Words   | Questions | Time Guidance        |
| ------- | ------- | --------- | -------------------- |
| 4.0-5.0 | ~200    | 3         | No time limit        |
| 5.0-6.0 | ~400    | 4         | 8 minutes suggested  |
| 6.0-6.5 | ~600    | 5         | 12 minutes suggested |
| 6.5+    | 600-900 | 6         | 15 minutes strict    |

**Question types** (vary across sessions):

- T/F/NG (True/False/Not Given)
- Matching headings
- Form completion / fill-in-blank
- Short answer
- Multiple choice
- Sentence completion
- Matching information

Topics: environment, education, health, history, science, society, culture, economics.
Use USER.md engage topics when IELTS task allows. Avoid comfort zone topics.

### [ ] S4 — Send Passage

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

### [ ] S5 — Wait for Response

### [ ] S6 — Score + Error Analysis

```
📊 **结果：3/4 正确**

1. ✅ True — 正确！
2. ❌ 你答的 "society"，正确答案是 "environment"
   📍 关键句：<tg-spoiler>"The environmental impact was the primary concern..."</tg-spoiler>
3. ✅ B — 正确！
4. ⚠️ 部分正确 — 缺少关键词
```

### [ ] S7 — Translation (Tiered)

| Band    | Strategy                                                |
| ------- | ------------------------------------------------------- |
| < 5.5   | Full passage translation in `<tg-spoiler>`              |
| 5.5-6.0 | Key sentence translations only                          |
| 6.5+    | Evidence lines only + `[显示翻译\|show_translation]` |

### [ ] S8 — Micro Drill: Sentence Anatomy (on wrong answers)

For each wrong answer, trigger Sentence Anatomy on the relevant sentence.
If no wrong answers, skip to S10.

### [ ] S9 — Forced Redo

User re-answers the wrong question(s) after sentence anatomy drill.

### [ ] S10 — Record

```bash
node tracker_db.js add-sample \
  --skill-type reading --mode standard \
  --question-type <types_comma_separated> \
  --redo-count <N> --support-level <level> \
  --duration-sec <N> --response-length-words <N>

node tracker_db.js add-error \
  --sample-id <id> --recurrence-key <key> --category reading \
  --severity <sev> --original-phrase "..." --correction "..."
```

```
[KEYBOARD:
😰 太难了=feedback_too_hard | 👌 刚好=feedback_just_right | 🥱 太简单=feedback_too_easy
🔁 再来一篇=reading | ⬆️ 更难=reading_harder | ⬇️ 更简单=reading_easier | 🏠 返回=menu
]
```

---

## Rules

1. **Passages must be original.** Don't copy real IELTS tests.
2. **Vary question types** across sessions. Don't repeat the same type 3x.
3. **Translation is tiered by band.** Never give full translation to 6.5+ by default.
4. **Sentence Anatomy triggers automatically** on wrong answers (especially T/F/NG and heading matching).
5. **Track time.** If consistently slow, suggest Flash-Skimming mode.
6. **Injected words must appear naturally.** Never force awkward usage.
7. **Micro Drill + Forced Redo are mandatory.** No session ends without S8+S9.
8. **Difficulty feedback keyboard at every session end.**
9. **Concise scoring for reading.** Don't send a full 4D table unless learner asks.
10. **Band-scale passage length.** Don't give 900 words to a band 4.5 learner.
