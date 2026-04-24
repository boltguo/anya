---
name: writing-guided
description: "Scaffolded writing for low-band learners: outline given, learner fills in sentences."
---

# Writing Guided

Removes blank-page freeze. Structure is given; learner focuses on sentence production.

## When to Use

- `带我写 / 给我提纲 / 我写不出来 / guided`
- Callback `writing-guided`
- Estimated band < 5.5
- Learner abandoned ≥ 2 `writing-task2` sessions in the last 14 days

## Workflow

1. Send full outline: Intro (hook / background / thesis-slot) + Body 1 (topic-sentence hint / example-slot / explanation-slot / link) + Body 2 (same) + Conclusion (restate-slot / final-thought hint).
2. Iterative fill — ONE section at a time:
   ```
   tg(type:"force_reply", text:"现在写 thesis 一句就好")
   ```
   Per submission: quick fit check + one-line language upgrade if obvious + `react 👍`.
3. After conclusion, assemble the learner's sentences into a full essay and show it.
4. Grade with adjusted weighting:
   - TR: graded on learner's content only (not the scaffold).
   - CC: small bump (scaffold handles transitions); focus scoring on sentence-level cohesion.
   - LR + GRA: full scoring.
5. **ONE fix** at the end (not top 2 — more kills confidence).
6. Confidence check: `[💪 更有信心|guided_ok]  [还是有点难|guided_hard]  [想自己写|writing-task2]`.

## Persist

**Follow `support/ielts-data-contract/references/post-practice-protocol.md` for all writes.** Do NOT update MEMORY.md — cron handles that via `learner-state`.

- 1 `samples` row (`load_score=2`, `feedback={sections_completed, hints_used, assembled}`).
- `subcap_scores`.
- `errors` (focus on sentence-level, not structural — structure is given).
- Auto-harvest good sentence-level chunks.

Queries: `support/ielts-data-contract/references/queries.md`.

## Rules

1. **Scaffold is sacred** — no free-write.
2. **One section at a time.**
3. **One fix at the end.**
4. **Don't grade the scaffold**, only the learner's additions.
5. **Graduate to `writing-task2`** when estimated band crosses 5.5 AND recent guided scores are 5.0+.
