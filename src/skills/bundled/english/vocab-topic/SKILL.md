---
name: vocab-topic
description: "Topic-cluster learning: 8-12 items on one topic, show → hide → recall."
---

# Vocab Topic

Teach vocab the way it's used — in topic-tight clusters.

## When to Use

- `话题词汇 / 教育话题 / 环境词汇 / topic vocab / 成组学`
- Callback `vocab-topic`

## Topics

education / technology / environment / health / work / society / culture / government.

Each bundle has:
- 4-5 core concepts
- 3-4 collocations / chunks
- 2-3 hedging / framing expressions

If the bank is thin (< 10), generate + save with `persist action="word_upsert"` and `origin="vocab-topic-seed"`.

## Workflow

1. Pick topic (learner or auto — weakest coverage / upcoming writing prompt).
2. Present 10-12 items grouped by kind. Optional audio bundle via `tts`.
3. Study window: announce "看 90 秒". Then hide via `tg_msg(type:"edit", message_id:"bundle", text:"📖 已隐藏")`.
4. Recall round — 5 mixed prompts:
   - CN→EN, meaning→chunk, fill-in-blank, register picker (formal vs informal), production sentence.
5. Score + reveal. For each tested item, call `persist action="word_review"`: remembered = `rating=4`, missed = `rating=1`.

## Persist

**Follow `support/data-contract/references/post-practice-protocol.md` for all writes.** Do NOT update MEMORY.md — `learner-state` skill handles that.

1. **`samples`** row:
   - `skill_type = 'vocab'`, `prompt` = topic name (e.g. `"education"`)
   - `response` = recall results (e.g. `"recall:3/5, missed: elaborate, fluctuate"`)
   - `accuracy` = recall correct / total (0.0–1.0)
   - `raw_score` = correct count, `max_score` = recall question count
   - `load_score = 1`
   - `feedback` = A concise but detailed textual analysis of this specific attempt. Write about what exactly the user missed, the root cause, and overall performance. Do NOT use JSON.
     Example: "The user struggled with relative clauses and vocabulary precision, but maintained good overall flow."

2. **`word_review` actions** — one per recalled/missed word.

3. **`activity_log`** — updated automatically by `persist`.

Queries: `support/data-contract/references/queries.md`.

## Rules

1. **One topic per session.**
2. **8-12 items sweet spot.**
3. **All 3 kinds** (concept / chunk / hedging).
4. **Hide before recall.**
5. **Audio bundle if available.**
6. **Auto-seed thin topics.**
