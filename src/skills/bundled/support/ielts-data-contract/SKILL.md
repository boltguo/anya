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
- `references/post-practice-protocol.md` — mandatory post-practice write protocol with per-type feedback JSON specs
- `references/error-keys.md` — canonical `errors.recurrence_key` list (keys NOT in this list are forbidden)

## Tables at a glance

| Table | Purpose |
| ----- | ------- |
| `samples` | one row per practice / mock / placement response; `accuracy` (0.0–1.0) for queryable correct ratio; `raw_score`/`max_score` for item counts; `feedback` must be natural language analysis; `mode` distinguishes exam vs study vs placement |
| `errors` | per-sample error rows, classified by `recurrence_key` (must come from `references/error-keys.md`) + category + severity |
| `sample_words` | words exposed during a sample (for coverage analytics) |
| `subcap_scores` | per-sample sub-capability band (uses canonical keys from `analysis-weakness`) |
| `daily_tasks` | today's planned tasks (primary / review / consolidation) |
| `mock_sessions` | one row per full mock or placement; `assessment_type` distinguishes placement-quick/full/mock/reassess |
| `stage_transitions` | long-horizon stage changes |
| `words` | vocabulary notebook — supports `word / chunk / pattern / personal_error / paraphrase_group` via `item_kind` |
| `word_events` | per-interaction events (lookup / review_pass / review_fail / push) |
| `paraphrase_groups`, `paraphrase_members` | synonym clusters |
| `band_trend` | rolling per-section band estimate by date (derived cache) |
| `activity_log` | daily activity summary: session count, minutes, sections touched, words reviewed |

## Rules

1. **One DB, one schema.** Always `db name=study`; never invent new DB names.
2. **Use parameterized queries.** Pass values via `params`, never string-concat.
3. **Subcap + error keys are canonical.** Error keys: `references/error-keys.md`. Subcap keys: `analysis-weakness/assets/subcap-catalog.md`.
4. **Record every session** as a `samples` row — even abandoned ones (`completed=0`).
5. **`prompt_hash` is load-bearing.** See `references/prompt-hash.md` before writing it.
6. **Schema changes = regenerate.** Delete `study.db`, recreate from `templates/study.sql`. No migration scripts.
7. **`feedback` must be natural language.** See `references/post-practice-protocol.md` for the per-type spec.
8. **Never leave `prompt` or `raw_content` empty.** These are essential for Revenge Protocol and Error Clinic.
