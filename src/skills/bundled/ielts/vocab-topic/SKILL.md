---
name: vocab-topic
description: "Topic-cluster learning: 8-12 items on one topic, show → hide → recall."
---

# Vocab Topic

Teach vocab the way it's used — in topic-tight clusters.

## When to Use

- `话题词汇 / 教育话题 / 环境词汇 / topic vocab / 成组学`
- Callback `vocab-topic`
- Before a writing-task2 / speaking-exam on a topic where the learner's topic vocab count is low (< 15 known items)

## Topics

education / technology / environment / health / work / society / culture / government.

Each bundle has:
- 4-5 core concepts
- 3-4 collocations / chunks
- 2-3 hedging / framing expressions

If bank thin (< 10), generate + save with `origin='vocab-topic-seed'`.

## Workflow

1. Pick topic (learner or auto — weakest coverage / upcoming writing prompt).
2. Present 10-12 items grouped by kind. Optional audio bundle via `tts`.
3. Study window: announce "看 90 秒". Then hide via `tg(type:"edit", message_id:"bundle", text:"📖 已隐藏")`.
4. Recall round — 5 mixed prompts:
   - CN→EN, meaning→chunk, fill-in-blank, register picker (formal vs informal), production sentence.
5. Score + reveal. Remembered items → +2d srs; missed → +1d.

## Persist

- 1 `samples` row (`load_score=1`, `feedback={topic, items_shown, recall_correct, missed_list}`).
- Update `words` counters + `srs_due` per item.
- `word_events` rows.

Queries: `support/ielts-data-contract/references/queries.md`.

## Rules

1. **One topic per session.**
2. **8-12 items sweet spot.**
3. **All 3 kinds** (concept / chunk / hedging).
4. **Hide before recall.**
5. **Audio bundle if available.**
6. **Auto-seed thin topics.**
