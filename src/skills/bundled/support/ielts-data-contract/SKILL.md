---
name: ielts-data-contract
description: "[SUPPORT] Canonical schema + query recipes for the single unified study.db."
---

# Study DB — Data Contract

One SQLite file (`study.db`) holds everything: practice samples, errors, subcap scores, mock sessions, daily tasks, stage transitions, vocabulary, SRS, paraphrase groups. Schema is in `templates/study.sql` — regenerate the `.db` from template when the schema changes (no migrations).

## When to Use

- Another skill needs a column name, query recipe, or write template → `skill_view name=ielts-data-contract file=references/queries.md`
- You don't remember a table's columns → call `db name=study` (no sql) for a full schema dump; on query error the response auto-includes the schema for the failing tables

Never user-facing. This skill is a reference, not a workflow.

## Resources

- `templates/study.sql` — full schema (tables + indexes)
- `references/queries.md` — common query recipes (reads, writes, joins)
- `references/prompt-hash.md` — canonical `samples.prompt_hash` rule (used by every writer)

## Tables at a glance

| Table | Purpose |
| ----- | ------- |
| `samples` | one row per practice / mock / placement / briefing response |
| `errors` | per-sample error rows, classified by `recurrence_key` + category + root cause |
| `sample_words` | words exposed during a sample (for coverage analytics) |
| `subcap_scores` | per-sample sub-capability band (uses canonical keys from `analysis-weakness`) |
| `daily_tasks` | today's planned tasks (primary / review / consolidation) |
| `mock_sessions` | one row per full mock (speaking / listening / reading / writing) |
| `stage_transitions` | long-horizon stage changes |
| `words` | vocabulary notebook — supports `word / chunk / pattern / personal_error / paraphrase_group` via `item_kind` |
| `word_events` | per-interaction events (lookup / review_pass / review_fail / push) |
| `paraphrase_groups`, `paraphrase_members` | synonym clusters |

## Rules

1. **One DB, one schema.** Always `db name=study`; never invent new DB names.
2. **Use parameterized queries.** Pass values via `params`, never string-concat.
3. **Subcap + error keys are canonical.** Source of truth: `analysis-weakness/assets/subcap-catalog.md` and `analysis-weakness/assets/error-taxonomy.md`.
4. **Record every session** as a `samples` row — even abandoned ones.
5. **`prompt_hash` is load-bearing.** See `references/prompt-hash.md` before writing it.
6. **Schema changes = regenerate.** Delete `study.db`, recreate from `templates/study.sql`. No migration scripts.
