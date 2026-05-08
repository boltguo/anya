---
name: speaking-repeat
description: "Listen-then-retell: play a clip once, learner retells in their own words."
---

# Speaking Repeat

Different from shadowing (verbatim) and freetalk (no input). Trains short-term holding + spontaneous phrasing.

## When to Use

- `复述 / retell / 听一段再说`
- Callback `speaking-repeat`
- Low `speaking.interaction` or `speaking.lexical_variety`
- Part 2 structure is weak (5-element coverage < 3/5)

## Workflow

1. Pick source by band:
   - < 5.0 → 2-3 simple sentences (20-40 words)
   - 5.0-6.0 → short anecdote (50-80 words)
   - 6.0-7.0 → 1-paragraph news excerpt (80-120 words)
   - 7.0+ → monologue with comparison / hypothetical (120-160 words)
2. `tts` once. `force_reply`: "听完一次就够。用你自己的话把重点说出来。"
3. Transcribe. Compute info overlap (kept / paraphrased / lost) + fluency signals. `pron_assess` only if pronunciation flagged weak.
4. Feedback — 3 parts: 信息完整度 / 流利度 / 换个说法 (原句 → 升级 → 原因). Reveal source via `<tg-spoiler>`.
5. Micro drill: use the upgraded phrase in one new sentence.
6. Persist: `samples` (load_score=2), subcap scores (`lexical_variety`, `interaction`, and `part2_structure` if narrative), auto-harvest the upgrade chunk.
7. Difficulty keyboard + `[🔁 speaking-repeat]  [🎭 speaking-roleplay]  [🏠 nav:main]`.

Queries: `support/data-contract/references/queries.md`.

## Rules

1. **Play once only.** Replay defeats the drill.
2. **Hide source until after** retell.
3. **Measure retention, not wording.** This is retell, not recitation.
4. **One upgrade per session.**
5. **Harvest good paraphrases.**
6. **Persist every session** even if retell is short.

## Persist

**Follow `support/data-contract/references/post-practice-protocol.md` for all writes.** Do NOT update MEMORY.md — `learner-state` skill handles that.
