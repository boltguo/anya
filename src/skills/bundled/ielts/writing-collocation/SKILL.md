---
name: writing-collocation
description: "Topic-based collocation drill: use 4+ chunks in a 100-word paragraph."
---

# Writing Collocation

Lexical Resource rises via chunks, not single words.

## When to Use

- `搭配 / collocation / 词汇搭配 / 高级表达`
- Callback `writing-collocation`
- `writing.lexical_sophistication ≤ 6.0`

## Topics

Rotate: education / technology / environment / health / work / society / culture / government.

Each topic has a seed bank of 8-12 items stored in `study.db` with `item_kind='chunk'` and `topics` tagged. If bank thin (< 6 items), generate and auto-save with `origin='writing-collocation-seed'`.

## Workflow

1. Pick topic + pull 8-12 chunks for the bank.
2. Show the bank (display only, no explanation).
3. `force_reply` "用至少 4 条搭配，写一段 ~100 字讨论 {{sub-question}}".
4. Scan the paragraph for the chunks. Mark each: ✅ natural / ⚠️ awkward / ❌ forced. Give inline fix for ⚠️/❌.
5. Top 1 upgrade (one chunk they missed or used badly) + single-sentence retry.

## Persist

- 1 `samples` row (`load_score=2`, `feedback={topic, bank_used, bank_ok}`).
- `subcap_scores.writing.lexical_sophistication` emphasised.
- `errors`: `collocation_error`, `word_choice`, `register_mismatch`.
- Update `words`: ✅ → `success_count++` + `transfer_level ≥ 4`; ⚠️/❌ → `fail_count++` + slight `transfer_level` drop.

Queries: `support/ielts-data-contract/references/queries.md`.

## Rules

1. **One topic per session.**
2. **≥ 4 collocations required.**
3. **Natural use is the benchmark**, not keyword stuffing.
4. **Per-collocation feedback** (✅ / ⚠️ / ❌).
5. **Auto-seed thin banks.**
6. **Retry is one sentence**, not a paragraph.
