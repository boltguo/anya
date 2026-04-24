---
name: coach-passive
description: "Answer the learner's on-demand coaching questions about progress, plan, and fixes."
---

# Coach Passive

Reactive. Reads state, answers a question, lands on one concrete next action.

## When to Use

- `给点建议 / 接下来练什么 / 下一步 / 我哪里最弱 / 为什么分数降了 / 这个错怎么改`
- Learner taps `💬 教练聊聊`
- Post-session plan question

## Workflow

1. Read `MEMORY.md` + recent samples/errors/subcap (14d).
2. Classify the question: diagnosis / plan / how-to / why.
3. Answer in ≤ 6 sentences. Always end with exactly one action button.

Templates for each question type live in `references/templates.md`.

Canonical keys: `analysis-weakness/assets/*`. Queries: `support/ielts-data-contract/references/queries.md`.

## Rules

1. **Data before advice.** Never invent a band change.
2. **One action button, always.** No open questions dangling.
3. **No MEMORY writes.** That's `learner-state`.
4. **No new drills launched here.** Suggest the callback; let the learner tap.
5. **Honor `Preferences.Tone`.**
6. **When uncertain, say so** (thin data → tentative phrasing).
7. **Deeper analysis → delegate** to `analysis-*` skills.
