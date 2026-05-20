---
name: data-contract
description: "[SUPPORT] Canonical schema + query recipes for the slim study.db."
---

# Study DB — Data Contract (v3, slim)

One SQLite file (`study.db`) holds the English learning loop. Schema lives at
`src/storage/study/study.sql` and is auto-applied on agent boot. Skills do
NOT read it directly — they go through the `persist` tool.

## Design principle

**Raw evidence tables strong; caches/derivatives weak.** Anything that can be
computed by a SELECT GROUP BY is **not** stored. If you find yourself wanting
to add a new field, ask: does it drive a learning decision? If not, leave it
out, put it in `metadata`, or derive at query time.

## When to Use

- Another skill needs a column name, query recipe, or write template → `skill_view name=data-contract file=references/queries.md`
- You need learner data → use typed `persist` actions. Never write raw SQL from a skill.

Never user-facing.

## Resources

- `references/queries.md` — persist actions and example payloads
- `references/post-practice-protocol.md` — mandatory post-practice write protocol
- `references/error-keys.md` — canonical recurrence_key whitelist (mirrored in `error_keys` table; unknown keys are dropped)
- `references/prompt-hash.md` — canonical 12-hex `samples.prompt_hash` rule

## Tables at a glance (11 tables, slim v3)

| Table | Purpose |
| ----- | ------- |
| `learner_profile` | single-row stable user facts: name, level, targets, exam, interests, notes |
| `study_sessions` | id + session_key + started_at + ended_at + status (everything else derives from samples) |
| `error_keys` | canonical recurrence_key whitelist; FK target for `errors.recurrence_key` |
| `samples` | one row per learning attempt. Carries prompt/response/feedback, accuracy, band_overall, assistance_level, prompt_hash, metadata. Sub-IELTS bands (task/coherence/lexical/grammar) go to `subcap_scores`. |
| `errors` | concrete per-sample mistakes |
| `error_patterns` | seen_count + severity_score aggregate; 30-day window and recent examples are derived via JOIN at read time |
| `subcap_scores` | fine-grained ability evidence on canonical 0-10 scale |
| `words` | vocabulary/SRS inventory |
| `lexical_topics` | (word, topic) relation for strict topic-filter queries |
| `word_reviews` | one row per SRS review attempt |
| `progress_snapshots` | weekly snapshot: week + 4 section scores + level + notes (everything else derives from samples) |

**Removed in v3 (relative to earlier versions):** `band_trend`, `activity_log`,
`daily_tasks`, `skill_runs`. All either derivable or feature dropped.

## Rules

1. **One DB, one schema, one gateway.** English learning data lives in `study.db`; skills access it through `persist`.
2. **Use `persist action="practice"` for post-practice writes.** It handles samples + errors + error_patterns + subcap_scores in one transaction.
3. **Use `persist` typed actions for everything else.** `word_upsert`, `word_review`, `due_words`, `word_lookup`, `study_summary`, `coach_context`, `recent_practice`, `learner_state_scores`, `profile_upsert`, `session_start`, `session_end`, `progress_snapshot`, `progress_trend`, `onboarding_done`.
4. **Do not use raw `db` for learner writes.** Skills should not depend on raw SQL for normal workflows.
5. **Error keys are enforced.** Persist validates `errors[].key` against the `error_keys` table. Unknown keys are dropped and returned in `unknown_error_keys`.
6. **Subcap keys** use `<domain>.<capability>` format. All values on the canonical **0-10 scale**. No scale_min/max — just `value`.
7. **Record every session — even abandoned ones** (`completed=0`; persist fills placeholders).
8. **`prompt_hash`** is **first 12 hex** of sha1(normalized prompt). See `references/prompt-hash.md`.
9. **Schema changes = drop & rebuild.** `rm ~/.anya/data/store/study.db*`, restart agent. No migrations.
10. **`feedback` must be natural language.** See `references/post-practice-protocol.md`.
