# Phase: TEEL Drill (paragraph-level scaffold)

> For learners with `paragraph_structure_weak` or `topic_sentence_weak` errors.

## S3-TEEL — Step-by-Step Paragraph

Present the TEEL structure with step-by-step `force_reply`:

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

## S5-TEEL — Assemble + Score

Combine all 4 parts into a complete paragraph. Score with 4D criteria.

Then proceed to the shared S6 (Focused Feedback) → S8 (Micro Drill) → S9 (Forced Rewrite) in the main SKILL.md.
