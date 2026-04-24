---
name: listening-exam
description: "Full IELTS Listening mock: 4 sections, 40 questions, band report."
---

# Listening Exam

~30 min audio + 10 min transfer. No pausing once a section starts.

## When to Use

- `听力模考 / full listening / mock listening`
- Callback `listening-exam`
- Exam-close rehearsal

## Structure

| Section | Content | Qs | Audio |
| ------- | ------- | -- | ----- |
| 1 | Social conversation | fill-in + MCQ | ~4 min |
| 2 | Monologue (tour / announcement) | labelling + map + matching | ~4 min |
| 3 | Academic conversation | MCQ + matching | ~4 min |
| 4 | Academic lecture | fill-in summary + short answer | ~5 min |

Band-mapping table + full workflow in `references/workflow.md`.

## Workflow (summary)

1. Consent card + start.
2. Per section: send header + questions (transcript hidden in spoiler), play TTS (multi-speaker for S1/S3), collect answers. No replay.
3. After S4: auto-grade (/40). Map raw → band.
4. Render report: per-section accuracy + top error buckets + top 2 fix suggestions.
5. Persist: 1 `samples` row per section, `subcap_scores` (connected_speech / academic_vocab / discourse_marker / implied_meaning / note_taking_stability), `errors` with canonical keys.
6. Hand off: `[🔍 listening-explain]  [🎯 top_drill]  [🏠 nav:main]`.

Queries: `support/ielts-data-contract/references/queries.md`. Subcap + error keys: `analysis-weakness/assets/*`.

## Scoring Reference

Before converting raw /40 to band, load: `skill_view name=ielts-band-descriptors file=references/score-conversion.md`

## Rules

1. **No pause, no replay.**
2. **Multi-speaker TTS** for S1 + S3 (British default).
3. **Section locked after grading.**
4. **3-min transfer window** after S4.
5. **Subcap + error keys canonical.**
6. **No MEMORY writes.**
