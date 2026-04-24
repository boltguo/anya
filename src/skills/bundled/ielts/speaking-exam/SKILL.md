---
name: speaking-exam
description: "Full IELTS Speaking mock: Part 1 + Part 2 + Part 3 with 4-criterion band report."
---

# Speaking Exam

Three-part exam, exam-style pacing, structured band report at the end.

## When to Use

- `口语模考 / full speaking / mock speaking`
- Callback `speaking-exam`
- Exam-close rehearsal scheduled by `coach-proactive`

For drills, route to `speaking-shadowing / repeat / freetalk / roleplay`.

## Structure

| Part | Content | Time |
| ---- | ------- | ---- |
| 1 | 4-5 familiar-topic Qs | 4-5 min |
| 2 | cue card, 1 min prep + 1-2 min talk | 3-4 min |
| 3 | 4-5 abstract follow-ups tied to Part 2 | 4-5 min |

Full workflow + report template in `references/workflow.md`.

## Workflow (summary)

1. Read USER + MEMORY + material bank (past Part 2 stories).
2. Run Parts 1 → 2 → 3 in order. Voice-first; call `pron_assess` on each usable answer (≥ 20 sec).
3. Pre-score: ask learner's self-predicted overall (metacognition).
4. Score 4 criteria with cited evidence (F&C / LR / GRA / Pron). Average → overall.
5. Persist one `samples` row per part (chain via `parent_sample_id`), subcap scores, errors with canonical keys.
6. Hand off: `[🔍 speaking-explain]  [🎯 top-fix drill]  [🏠 nav:main]`.

Queries: `support/ielts-data-contract/references/queries.md`. Subcap keys: `analysis-weakness/assets/subcap-catalog.md`.

## Scoring Reference

Before scoring, load the rubric: `skill_view name=ielts-band-descriptors file=references/speaking-rubric.md`

## Rules

1. **Pacing is real** — strict 1-min Part 2 prep.
2. **Voice first.** Note text fallback in report.
3. **One cue card per session.**
4. **Always `pron_assess`** on ≥ 20-sec audio.
5. **`parent_sample_id`** chains Part 2/3 to Part 1.
6. **Subcap + error keys canonical.**
7. **No MEMORY writes** — `learner-state` aggregates.
