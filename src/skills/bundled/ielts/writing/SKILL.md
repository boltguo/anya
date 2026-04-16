---
name: writing
description: 'IELTS writing: brainstorming + TEEL scaffold + forced rewrite loop + Task 1/2'
version: '3.0.0'
metadatahermes:
  tags: [ielts, writing, task1, task2, teel, rewrite]
  category: anya
---

# Writing Coach — Scaffolded Rewrite System

## When to Use

- Learner says "写作", "writing", "练写作", "学写作", "作文", "写essay"
- Callback: `writing` or any `writing:*` mode callback
- Reply Keyboard tap: "✍️ 写作"

## Data

Session saved to `~/.anya/data/ielts/learn/{timestamp}_writing.json` after completion.
Synced to `learner.db` via `db` tool.

## Mode Matrix

| Phase          | Mode                       | When                             | Callback           |
| -------------- | -------------------------- | -------------------------------- | ------------------ |
| **Cold start** | Brainstorming              | band < 5.5, brain blank          | `writing:brain` |
| **Paragraph**  | TEEL Drill                 | Logic scattered, can't structure | `writing:teel`  |
| **Full task**  | Full Task + Forced Rewrite | Regular training                 | `writing`       |
| **Task 1**     | Chart Description          | Task 1 practice                  | (via S2 decision)  |

---

## Workflow

### [ ] S1 — Context Load

1. Read MEMORY.md → current writing band + weak dimensions
2. Read USER.md → interests (for topic personalization)
3. Query `db name=learner sql="SELECT id, created_at, band_overall FROM samples WHERE skill_type='writing' ORDER BY created_at DESC LIMIT 5"`
4. Query `db name=learner sql="SELECT recurrence_key, category, COUNT(*) as count FROM errors e JOIN samples s ON e.sample_id=s.id WHERE s.skill_type='writing' GROUP BY recurrence_key ORDER BY count DESC LIMIT 10"`

### [ ] S2 — Decision Engine

Decide task type:

- **Task 1** (150+ words): chart, graph, table, map, process
- **Task 2** (250+ words): opinion, discussion, problem-solution, advantages-disadvantages

Target difficulty = current band + 0.5.

Check if Brainstorming is needed:

- band < 5.5 → **force Brainstorming phase** before writing
- band ≥ 5.5 → direct to prompt

Check if TEEL Drill is appropriate:

- `paragraph_structure_weak` or `topic_sentence_weak` in recent errors → suggest TEEL Drill
- User callback `writing:teel` → TEEL Drill mode

Vocabulary injection:

```
db name=vocab sql="SELECT word, definition FROM words WHERE topics LIKE ? AND mastery IN ('learning','known') ORDER BY srs_due LIMIT 3" params='["%<topic>%"]'
```

---

## Phase: Brainstorming (band < 5.5, mandatory)

> Don't let the learner write before they think.

### [ ] S3a — Brainstorming

```
tg(type:"force_reply", text:"先不写正文！\n\n用中文或简单英文列出 2 个支持论点：\n题目: <topic>\n\n比如：\n1. 原因/论点1\n2. 原因/论点2")
```

### [ ] S3b — Translate to IELTS Vocabulary

Anya translates the learner's arguments into IELTS-level vocabulary and collocations:

```
你的论点很好！用雅思高分表达：

1. "环境污染" → environmental degradation / ecological damage
   搭配: pose a significant threat to...
2. "省钱" → cost-effective / financially viable
   搭配: in the long run, this approach proves to be...

现在带着这些表达开始写 👇
```

Then proceed to S4.

---

## Phase: TEEL Drill (paragraph-level scaffold)

> For learners with `paragraph_structure_weak` or `topic_sentence_weak` errors.

### [ ] S3-TEEL — Step-by-Step Paragraph

Present the TEEL structure with step-by-step force_reply:

**T — Topic Sentence:**

```
tg(type:"force_reply", text:"📝 T (主题句): 用一句话表达你这段的核心观点\n\n题目: <topic>")
```

→ Evaluate: Is it a clear, arguable statement? Feedback immediately.

**E — Explain:**

```
tg(type:"force_reply", text:"📝 E (解释): 为什么你这么认为？用1-2句解释")
```

→ Evaluate: Does it logically support the topic sentence?

**E — Example:**

```
tg(type:"force_reply", text:"📝 E (举例): 给一个具体的例子来支持你的观点")
```

→ Evaluate: Is the example specific (not vague "many people think so")?

**L — Link:**

```
tg(type:"force_reply", text:"📝 L (总结): 用一句话总结这段，呼应主题句")
```

→ Evaluate: Does it close the paragraph logically?

### [ ] S5-TEEL — Assemble + Score

Combine all 4 parts into a complete paragraph. Score with 4D criteria.

Then proceed to S6 (Focused Feedback) → S8 (Micro Drill) → S9 (Forced Rewrite).

---

## Phase: Full Task (regular training)

### [ ] S3 — Send Prompt

If Task 2:

```
tg(type:"force_reply", text:"✍️ **Writing Task 2**\n\n<prompt text>\n\n⏱ 目标：250+ 词\n💡 挑战词汇：<injected words>")
```

If Task 1 — first select chart type:

```
[KEYBOARD:
📊 柱状图=writing:bar | 📈 折线图=writing:line | 🥧 饼图=writing:pie
🗺️ 地图=writing:map | 🔄 流程图=writing:process
]
```

Then generate chart description (or `tg(type:"photo")` if image available):

```
tg(type:"force_reply", text:"✍️ **Writing Task 1**\n\n<chart description>\n\n⏱ 目标：150+ 词\n💡 图表高频词：fluctuate, peak, plateau, account for, respectively")
```

### [ ] S4 — Wait for Response

Learner writes and submits.

### [ ] S5 — Wait for Response (continued)

Accept the text.

---

## Shared Steps (All Modes)

### [ ] S6 — 4D Scoring + Diff Highlight

| Criterion                | Score   |
| ------------------------ | ------- |
| Task Response            | X.0     |
| Coherence & Cohesion     | X.0     |
| Lexical Resource         | X.0     |
| Grammar Range & Accuracy | X.0     |
| **Overall**              | **X.0** |

Highlight specific issues with diff markers:

```
❌ "This is ~bad~ for environment"
✅ "This is **detrimental** to **the** environment"
```

### [ ] S7 — Focused Feedback (1-2 core bottlenecks only)

Do NOT list 10 errors. Pick the **1-2 most impactful** issues:

- Example: "缺连接词" + "bad 太低级"
- Show Band-Up: current sentence → +1.0 band version

### [ ] S8 — Micro Drill

Target the #1 bottleneck with a mini-exercise:

```
tg(type:"force_reply", text:"用 detrimental 替换 bad，造一个新句子")
```

Verify the micro drill response. If wrong, give one correction and move on.

### [ ] S9 — Forced Rewrite (**不重写完不准下课**)

```
tg(type:"force_reply", text:"带着新的连接词和高级词汇，把整个段落重写一遍发给我")
```

**AI Compare**: Initial draft vs rewrite.

If improved (≥ +0.5 band on any dimension):

```
tg(type:"react", emoji:"🎉")
```

→ Celebrate + proceed to S10.

If NOT improved:

```
"再试一次 — 试试在开头加 Consequently，把 good 换成 beneficial"
```

→ One more rewrite attempt. Max 2 rewrites, then move on with encouragement.

### [ ] S10 — Record + Difficulty Feedback

```
db name=learner sql="INSERT INTO samples (created_at, skill_type, prompt, band_task, band_coherence, band_lexical, band_grammar, band_overall, session_id) VALUES (datetime('now'), 'writing', ?, ?, ?, ?, ?, ?, ?)" params='["<mode>", null, null, null, null, null, "<session_id>"]'

db name=learner sql="INSERT INTO errors (sample_id, recurrence_key, category, severity, original_phrase, correction) VALUES (?, ?, ?, ?, ?, ?)" params='[<sample_id>, "<key>", "<cat>", "<sev>", "...", "..."]'
```

```
[KEYBOARD:
😰 太难了=feedback_too_hard | 👌 刚好=feedback_just_right | 🥱 太简单=feedback_too_easy
🔁 再来一题=writing | 🏠 返回菜单=menu
]
```

---

## Rules

1. **Never rewrite the entire essay.** Only Top 2 fixes + 1 Band-Up example + Micro Drill.
2. **Never give a model answer before the learner writes.**
3. **Brainstorming is mandatory for band < 5.5.** No direct writing allowed.
4. **Forced Rewrite is mandatory.** 不重写完不准下课. Max 2 rewrite attempts.
5. **Task 2 topics**: Push beyond comfort zone. Vary: environment, education, health, society.
6. **Task 1 topics**: Vary chart types. Don't repeat consecutively.
7. **Force-reply for all input.** Links the answer to the prompt.
8. **No text reply alongside force-reply.** Avoids race conditions.
9. **Micro Drill + Forced Redo are mandatory.** No session ends without S8+S9.
10. **Difficulty feedback keyboard at every session end.**
11. **Challenge words**: Inject recently learned L2+ vocabulary.
