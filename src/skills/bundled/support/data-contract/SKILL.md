---
name: data-contract
description: "[SUPPORT] Canonical schema + query recipes for the single unified study.db."
---

# Study DB — Data Contract

One SQLite file (`study.db`) holds the English learning loop: learner profile, daily plan, practice samples, concrete errors, recurring weakness patterns, subcap scores, vocabulary, SRS reviews, IELTS-style band trends, and daily activity. Conversation history stays in `state.db`. Schema is in `templates/study.sql` — regenerate the `.db` from template when the schema changes (no migrations).

Markdown files constrain the agent; tables store learner data. `SOUL.md` defines Anya's identity, `RULES.md` defines behavior/tool rules, `USER.md` stores stable user facts plus behavior/preferences, and `MEMORY.md` stores the learner's long-running level and ability state. Durable practice evidence must be persisted in `study.db`, then summarized back into markdown when useful.

## When to Use

- Another skill needs a column name, query recipe, or write template → `skill_view name=data-contract file=references/queries.md`
- You need learner data → use typed `persist` actions (`study_summary`, `due_words`, `word_lookup`, etc.). Do not ask skills to write raw SQL.

Never user-facing. This skill is a reference, not a workflow.

## Resources

- `templates/study.sql` — full schema (tables + indexes)
- `references/queries.md` — common query recipes (reads, writes, joins)
- `references/prompt-hash.md` — canonical `samples.prompt_hash` rule (used by every writer)
- `references/post-practice-protocol.md` — mandatory post-practice write protocol using the `persist` tool (structured parameters, no raw SQL)
- `references/error-keys.md` — canonical `errors.recurrence_key` list (keys NOT in this list are forbidden)

## Tables at a glance

| Table | Purpose |
| ----- | ------- |
| `learner_profile` | single-row source of truth for stable learner facts: level, targets, exam date, daily budget, interests, preferences, strengths, weaknesses |
| `daily_tasks` | planned study slots for a day; router/menu reads this to show what to do next |
| `samples` | one row per actual practice/placement/mock-section attempt; stores prompt, user response, feedback, scores, bands, and retry chain keys |
| `errors` | concrete per-sample mistakes with canonical `recurrence_key`, severity, original phrase, correction, and rule note |
| `error_patterns` | recurring weakness aggregate derived from `errors`; planner/coaching reads this for priorities |
| `subcap_scores` | fine-grained ability evidence such as `writing.argument_depth` or `listening.connected_speech` |
| `words` | vocabulary/SRS inventory for words, chunks, patterns, and personal-error cards |
| `word_reviews` | one row per SRS review attempt; preserves rating/pass/fail/interval evidence |
| `band_trend` | daily derived band estimate per section/domain |
| `activity_log` | daily aggregate for sessions, minutes, touched sections, and reviewed words |

## Rules

1. **One DB, one schema, one gateway.** English learning data lives in `study.db`, but skills access it through `persist`.
2. **Use `persist action="practice"` for post-practice writes.** It handles samples, errors, error_patterns, subcap_scores, band_trend, and activity_log in one atomic transaction.
3. **Use `persist` typed actions for vocabulary, planning, profile, and summaries.** `word_upsert`, `word_review`, `due_words`, `word_lookup`, `study_summary`, `profile_upsert`, `task_upsert`, `due_tasks`, and `task_complete` are the supported paths.
4. **Do not use raw `db` for learner writes.** The `db` tool blocks writes to `study.db`; skills should not depend on raw SQL for normal English workflows.
5. **Subcap + error keys are canonical.** Error keys: `references/error-keys.md`. Subcap keys must use the skill-documented `<domain>.<capability>` format, e.g. `writing.argument_depth`, `listening.connected_speech`.
6. **Record every session** — even abandoned ones (`completed=0`; `persist` will use safe placeholders if response/feedback is unavailable).
7. **`prompt_hash` is load-bearing.** See `references/prompt-hash.md` before writing it.
8. **Schema changes = regenerate during early development.** Delete `study.db`, recreate from `templates/study.sql`. No migration scripts until real user data must be preserved.
9. **`feedback` must be natural language.** See `references/post-practice-protocol.md` for the per-type spec.
