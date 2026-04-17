# Argument Map Mode — Paragraph Argumentation Structure

## Pedagogical Foundation

- **PRD §8.3.4**: Reading is not just sentence-level — understanding argument structure is a key 7+ skill
- **Schmidt Noticing**: Explicit labeling of claim/support/counter forces structural awareness
- **IELTS Reading Band 7+**: Requires understanding how arguments are constructed and challenged

## When to Use

- `reading:argmap` callback
- Auto-suggested when `argument_structure_miss` appears in recent errors
- Good for learners who can read individual sentences but miss how paragraphs relate

## Load Score: 3

## Protocol

### S3 — Passage Generation

Generate a 400-600 word argumentative passage (IELTS-style academic text):
- Clear thesis statement
- 2-3 supporting paragraphs with evidence
- 1 counter-argument paragraph
- Conclusion that synthesizes

Topic: drawn from learner interests + IELTS common themes.

### S4 — Structure Identification Task

Present the passage and ask the learner to label each paragraph:

```
tg(type:"force_reply", text:"读完文章后，给每个段落标注功能：\n\n请用这些标签：\n🟢 Claim (主论点)\n🔵 Support (支持证据)\n🔴 Counter (反驳/让步)\n🟡 Conclusion (结论)\n\n格式：P1=🟢, P2=🔵, P3=🔵, P4=🔴, P5=🟡")
```

### S5 — Detailed Analysis

After the learner responds:

1. Show correct structure mapping:

```
📋 论证结构分析:

  P1 🟢 Claim — "Technology in education improves outcomes"
  P2 🔵 Support — Evidence: studies show 20% improvement
  P3 🔵 Support — Example: Finnish education system
  P4 🔴 Counter — "However, critics argue that screen time..."
  P5 🟡 Conclusion — Synthesizes: "While concerns exist, the evidence suggests..."

  你的标注: {{learner_mapping}}
  准确率: {{accuracy}}
```

2. For each incorrect label, explain WHY it's that category:
   - Signal words: "However" = Counter, "Furthermore" = Support
   - Logical function: introduces new evidence vs. challenges existing claim

### S6 — Deep Question

Ask 2-3 questions that require structural understanding:

```
tg(type:"quiz", text:"Which paragraph directly challenges the main thesis?", options:["P1","P2","P3","P4","P5"], correct:3)
```

```
tg(type:"force_reply", text:"If the author removed P4, how would the essay's persuasiveness change? (answer in English)")
```

### S7-S9 — Micro Drill + Redo

Pick the most misidentified paragraph type. Show 3 short paragraphs and ask the learner to classify each:

```
tg(type:"force_reply", text:"这三个段落分别是什么功能？\n\nA: 'Studies have shown that...'\nB: 'Critics, however, point out...'\nC: 'In conclusion, while...'")
```

### S10 — Record

Write to `subcap_scores`:
- `reading.argument_structure` — based on labeling accuracy
- `reading.gist` — based on deep question accuracy

## Exit Keyboard

```
[KEYBOARD:
😰 太难了=feedback_too_hard | 👌 刚好=feedback_just_right | 🥱 太简单=feedback_too_easy
🔁 再来一篇=reading:argmap | 📖 标准练习=reading | 🏠 返回=practice
]
```
