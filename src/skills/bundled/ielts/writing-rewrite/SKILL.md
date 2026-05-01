---
name: writing-rewrite
description: "Upgrade a sample Band 5/6 paragraph to Band 7 quality."
---

# Writing Rewrite

Less intimidating than writing from scratch. Teaches the exact deltas between band levels.

## When to Use

- `改写 / rewrite / 样文升级`
- Callback `writing-rewrite`
- `writing.lexical_sophistication` or `writing.cohesion_logic` is the weakest subcap

## Source bands

| Current | Source | Target |
| ------- | ------ | ------ |
| 5.0 | 4.5 | 5.5 |
| 5.5 | 5.0 | 6.0 |
| 6.0 | 5.5 | 6.5 |
| 6.5+ | 6.0 | 7.0 |

## Workflow

1. Pick topic (from recent `writing-task2` prompts or aligned with `Content Profile.engage`).
2. Send sample paragraph + 4 explicit rewrite goals (词汇升级 / 结构紧凑 / 连接控制 / 保持原意). Optionally pre-annotate 1-2 weak spots with `~...~`.
3. `force_reply` for the rewrite.
4. Compare learner's version vs a model Band-7 version. Show diff by 3 axes: lexical / structural / cohesion.
5. Score against 4 criteria (range 5.0-7.5).
6. Top 1 takeaway (原句 → 模型句 → 教法).
7. Micro drill: use the upgrade chunk in one new sentence.

## Persist

**Follow `support/ielts-data-contract/references/post-practice-protocol.md` for all writes.** Do NOT update MEMORY.md — `learner-state` skill handles that.

- 1 `samples` row (`load_score=3`, `prompt_hash=<sample_hash>`, `redo_count=1`, `feedback={source_band, target_band, delta_achieved}`).
- `subcap_scores`: `writing.lexical_sophistication` + `.cohesion_logic` + `.connector_density` emphasized.
- Auto-harvest the teaching-point chunk.

Queries: `support/ielts-data-contract/references/queries.md`.

## Rules

1. **Source band = current − 1** (min 4.0).
2. **Show the model version.**
3. **Teach 3 axes** — lexical / structural / cohesion.
4. **One takeaway chunk** — harvest it.
5. **One paragraph per session.**
