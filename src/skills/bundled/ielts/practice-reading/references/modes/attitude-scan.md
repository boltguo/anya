# Attitude Scan Mode — Author Stance Detection

## Pedagogical Foundation

- **PRD §6.2**: Author attitude identification is a key reading sub-capability for band 7+
- **Schmidt Noticing**: Explicit highlighting of attitude-carrying words forces lexical sensitivity
- **IELTS Reading**: T/F/NG and matching questions often hinge on detecting author stance

## When to Use

- `reading:attitude` callback
- Auto-suggested when `author_attitude_miss` appears in recent errors
- Good complement to Standard Practice for band 6.0+ learners

## Load Score: 2

## Protocol

### S3 — Passage with Embedded Attitude

Generate or select a 300-500 word passage where the author has a clear but nuanced stance:
- Uses hedging language ("arguably", "one might suggest", "it remains debatable")
- Uses emphasis language ("undeniably", "crucially", "it is clear that")
- Uses irony or understatement (for C-level learners)
- Topic: drawn from IELTS academic themes

### S4 — Attitude Word Hunt

```
tg(type:"force_reply", text:"找出文章中表达作者态度的词/短语，标注它们表达的是：\n\n🟢 积极/支持\n🔴 消极/反对\n🟡 不确定/让步\n\n格式示例：\n- arguably (🟡)\n- undeniably (🟢)\n- questionable (🔴)")
```

### S5 — Feedback + Missing Words

Show what the learner found vs. what they missed:

```
📋 态度词分析:

  ✅ 你找到的:
    - "arguably" (🟡) — correct!
    - "crucial" (🟢) — correct!

  ❌ 你漏掉的:
    - "**merely**" → 轻视/贬低 (🔴)
    - "**admittedly**" → 让步 (🟡)
    - "**overwhelming**" → 强调 (🟢)

  📝 常见态度词分类:
    🟢 支持: crucial, significant, undeniably, compelling
    🔴 反对: merely, questionable, flawed, dubious
    🟡 让步: arguably, admittedly, while, although
```

### S6 — Stance Questions

```
tg(type:"quiz", text:"Overall, the author's attitude towards {{topic}} is:", options:["Strongly supportive","Cautiously optimistic","Neutral","Critical","Dismissive"], correct:<n>)
```

```
tg(type:"force_reply", text:"Which sentence most clearly reveals the author's main position? Quote it.")
```

### S7-S9 — Micro Drill

Present 5 isolated sentences. For each, the learner identifies the attitude:

```
tg(type:"quiz", text:"'The policy has had a **questionable** impact on...' — 作者觉得这个政策:", options:["很好","有问题","不确定","很差"], correct:1)
```

Redo any wrong answers with explanation.

### S10 — Record

Write to `subcap_scores`:
- `reading.author_attitude` — based on word-hunt completeness + stance question accuracy

Auto-harvest attitude vocabulary into vocab.db as patterns:

```
db name=vocab sql="INSERT OR IGNORE INTO words (word, definition, chinese, pos, source, origin, example_en, mastery, item_kind, source_sample_id, created_at, updated_at) VALUES (?, ?, ?, 'pattern', 'practice', 'auto_harvest', ?, 'learning', 'pattern', ?, datetime('now'), datetime('now'))" params='["arguably + claim", "used to hedge a claim", "用来缓和断言", "This is arguably the most important factor.", <sample_id>]'
```

## Exit Keyboard

```
[KEYBOARD:
😰 太难了=feedback_too_hard | 👌 刚好=feedback_just_right | 🥱 太简单=feedback_too_easy
🔁 再来一篇=reading:attitude | 📖 标准练习=reading | 🏠 返回=practice
]
```
