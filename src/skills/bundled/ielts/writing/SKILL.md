---
name: writing
description: "IELTS writing practice: prompt → write → 4D scoring → error fix"
version: "2.0.0"
metadatahermes:
  tags: [ielts, writing, task1, task2]
  category: anya
---

# Writing Coach

## When to Use

- Learner says "写作", "writing", "练写作", "学写作", "作文", "写essay"
- Callback: `ck:writing`
- Reply Keyboard tap: "✍️ 写作"

## Data

Session saved to `~/.anya/data/ielts/learn/{timestamp}_writing.json` after completion.
Synced to `learner.db` via `tracker_db.py`.

## Workflow

### [ ] Step 1 — Assess & Plan

1. Read MEMORY.md → current writing band + weak dimensions
2. Read USER.md → interests (for topic personalization)
3. Decide task type:
   - **Task 1** (150+ words): chart, graph, table, map, process
   - **Task 2** (250+ words): opinion, discussion, problem-solution, advantages-disadvantages
4. Target difficulty = current band + 0.5

### [ ] Step 2 — Vocabulary Injection

```bash
node vocab_db.js inject --topic <topic> --limit 3
```

Get 3 due words to weave into the prompt as optional challenge words.

### [ ] Step 3 — Send Prompt

Use `force-reply` to anchor the learner's response:

```bash
[native] adapter.force-reply \
  --text "✍️ **Writing Task 2**\n\n<prompt text>\n\n⏱ 目标：250+ 词\n💡 挑战词汇：ubiquitous, resilient, paradigm"
```

**No additional text reply in this turn.** The force-reply IS the output.

### [ ] Step 4 — Wait for Response

Learner writes their essay and sends it as a reply. Accept the text.

### [ ] Step 5 — Score (4D IELTS)

Score the essay on four dimensions (0.5 increments):

| Criterion | Score |
|---|---|
| Task Response | X.0 |
| Coherence & Cohesion | X.0 |
| Lexical Resource | X.0 |
| Grammar Range & Accuracy | X.0 |
| **Overall** | **X.0** |

### [ ] Step 6 — Error Correction

Top 3 errors, each with:
- ❌ Original phrase
- ✅ Corrected version
- 💬 Brief explanation

### [ ] Step 7 — Band-Up Example

Pick 1 sentence, show current vs +1.0 band version.

### [ ] Step 8 — Record to DB

```bash
node tracker_db.js add-sample \
  --skill-type writing \
  --prompt "..." --raw-content "..." \
  --band-task X.X --band-coherence X.X --band-lexical X.X --band-grammar X.X --band-overall X.X

node tracker_db.js add-error \
  --sample-id <id> --recurrence-key <key> --category <cat> \
  --severity <low|medium|high> --original-phrase "..." --correction "..."
```

### [ ] Step 9 — Next Step

```text
[KEYBOARD:
🔁 再来一题=ck:writing | 🏠 返回菜单=ck:menu
]
```

## Rules

1. **Never rewrite the entire essay.** Only Top 3 fixes + 1 Band-Up example.
2. **Never give a model answer before the learner writes.**
3. **Task 2 topics**: Avoid technology/software (learner's comfort zone). Push environment, education, health.
4. **Task 1 topics**: Vary chart types. Don't repeat consecutively.
5. **Force-reply for input.** Links the answer to the prompt.
6. **No text reply alongside force-reply.** Avoids race conditions.
