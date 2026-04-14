---
name: reading
description: "IELTS reading practice: passage + questions, accuracy tracking"
version: "2.0.0"
metadatahermes:
  tags: [ielts, reading, comprehension]
  category: anya
---

# Reading Trainer

## When to Use

- Learner says "阅读", "reading", "练阅读", "学阅读", "看文章"
- Callback: `ck:reading`
- Reply Keyboard tap: "📖 阅读"

## Data

Session saved to `~/.anya/data/ielts/learn/{timestamp}_reading.json` after completion.
Synced to `learner.db` via `tracker_db.py`.

## Workflow

### [ ] Step 1 — Assess & Plan

1. Read MEMORY.md → current reading band
2. Map band to CEFR: 4-5 → B1, 5-6 → B2, 6+ → C1
3. Read USER.md → interests for topic selection
4. Topics: environment, education, health, history, science, society, culture, economics
5. **Avoid technology/software** (learner's comfort zone)

### [ ] Step 2 — Vocabulary Injection

```bash
node vocab_db.js inject --topic <topic> --limit 3
```

### [ ] Step 3 — Generate & Send Passage

Generate a ~300-word passage with injected vocab used naturally.
Send as formatted text:

```text
📖 **Reading Practice**

<passage text>

---

**Questions** (3 题)

1. [T/F/NG] According to the passage, ...
2. [Fill-in] The author suggests that ___ is ...
3. [Multiple Choice] What is the main idea of paragraph 3?
   A) ...  B) ...  C) ...  D) ...

✏️ 回复你的答案，比如：1. True  2. environment  3. B
```

Vary question types: T/F/NG, matching, fill-in-blank, short answer, multiple choice.

### [ ] Step 4 — Wait for Response

Learner sends answers as text.

### [ ] Step 5 — Check & Score

Grade answers: ✅ correct / ❌ incorrect / ⚠️ partial

Use concise result format (not full 4D table for reading):

```text
📊 **结果：2/3 正确**

1. ✅ True — 正确！
2. ❌ 你答的 "society"，正确答案是 "environment"
   📍 关键句：||"The environmental impact was the primary concern..."||
3. ✅ B — 正确！
```

Use spoiler `||text||` for key sentences so learner can self-think first.

### [ ] Step 6 — Full Transcript

After scoring, send Chinese translation of the passage:

```text
📝 **全文翻译**

||<full Chinese translation>||
```

### [ ] Step 7 — Record to DB

```bash
node tracker_db.js add-sample \
  --skill-type reading \
  --prompt "..." --raw-content "learner answers" \
  --band-overall X.X

node tracker_db.js add-error \
  --sample-id <id> --recurrence-key <key> --category <cat> \
  --severity <low|medium|high> --original-phrase "..." --correction "..."
```

### [ ] Step 8 — Next Step

```text
[KEYBOARD:
🔁 再来一题=ck:reading | ⬆️ 更难=ck:reading:harder | ⬇️ 更简单=ck:reading:easier | 🏠 返回菜单=ck:menu
]
```

## Rules

1. **Passages must be original.** Don't copy real IELTS tests.
2. **Vary question types** across sessions.
3. **Always include translation** — send after the learner answers, behind spoiler.
4. **Track time.** If >15 min for 300 words, note speed issue in feedback.
5. **Injected words must appear naturally.** Never force awkward usage.
6. **Concise scoring for reading.** Don't send a full 4D table unless learner asks.
