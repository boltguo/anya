---
name: reading-untimed
description: "No-clock deep read: main idea + paragraph function + paraphrase + author stance."
---

# Reading Untimed

Goal: teach structure, paraphrase tracking, and stance judgement. No clock.

## When to Use

- `精读 / 非限时 / 仔细读 / untimed`
- Callback `reading-untimed`
- Errors cluster around comprehension (`tfng_logic_error`, `inference_error`, `keyword_matching_error`)

## Passage requirements

500-800 words aligned with `Content Profile.engage`. Must include ≥ 1 of: contrast / concession, hedging claim, shift of stance, paraphrased key term.

## Workflow (4 phases)

### Phase 1 — Main idea
`force_reply` "用一句话说主旨（≤ 15 字）". Grade. Miss → flag `reading.gist`.

### Phase 2 — Paragraph function map
`force_reply` "给每个段落一个功能标签：导入 / 提出问题 / 正论据 / 反论据 / 作者观点 / 结论". Reveal correct map. Misses → `reading.argument_structure`.

### Phase 3 — Paraphrase tracking
Pick 3 key terms paraphrased in the passage. `force_reply` for the 3 pairs. Misses → `reading.paraphrase_mapping`.

### Phase 4 — Author stance
`quiz`: 支持 / 反对 / 有保留支持 / 中立. With `explanation` citing evidence. Miss → `reading.author_attitude`.

## Wrap

Per-phase tally + top learning point + follow-up drill suggestion.

## Persist

**Follow `support/ielts-data-contract/references/post-practice-protocol.md` for all writes.** Do NOT update MEMORY.md — cron handles that via `learner-state`.

- 1 `samples` row (`load_score=2`, `feedback={phases_json}`).
- `subcap_scores` per phase: `reading.gist`, `.argument_structure`, `.paraphrase_mapping`, `.author_attitude`.
- `errors` per wrong phase.
- Auto-harvest 1-2 paraphrase pairs as `paraphrase_group` entries in `study.db`.

Queries: `support/ielts-data-contract/references/queries.md`.

## Rules

1. **Four phases, in order.**
2. **Main idea word-cap 15.**
3. **Reveal each phase answer** before moving on.
4. **Harvest paraphrase pairs.**
5. **No clock shown.**
