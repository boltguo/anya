---
name: writing-exam
description: "Full IELTS Writing mock: Task 1 (20m) + Task 2 (40m) + 4-criterion report."
---

# Writing Exam

60 min total, strict. Task 2 weighs 2× Task 1 in the writing Overall.

## When to Use

- `写作模考 / full writing / mock writing`
- Callback `writing-exam`
- Exam-close rehearsal

## Workflow

1. Consent.
2. **Task 1** (20 min):
   - Academic (chart/map/process) or GT letter per `Goals.exam_type` (default Academic).
   - For Academic, `image_gen` a chart and send via `tg(type:"photo", ...)`.
   - `force_reply` ≥ 150 words.
3. **Task 2** (40 min):
   - Opinion / discussion / problem-solution / adv-disadv prompt aligned with `Content Profile.engage`.
   - `force_reply` ≥ 250 words.
4. **Self-prediction** (before scoring): "你觉得自己 Overall 大概几分？"
5. **Score**: each task → 4 criteria + Overall. `writing_overall = (t1 + 2×t2) / 3`, round 0.5.
6. **Report**: table + top 2 issues per task + self-pred gap.
7. **Persist**: 2 `samples` rows (one per task) with bands, `prompt_hash`, `load_score=3 (T1) / 4 (T2)`, `feedback={word_count, time_sec, essay_type, self_pred}`. Subcap scores (all 7 writing keys). Errors with canonical keys. Auto-harvest band-7+ chunks.

Queries: `support/ielts-data-contract/references/queries.md`.

## Scoring Reference

Before scoring, load the rubric: `skill_view name=ielts-band-descriptors file=references/writing-rubric.md`

## Rules

1. **60 min strict**, no cross-over.
2. **Word counts enforced** — under-length → TR penalty.
3. **Task 2 weighs 2×.**
4. **Evidence-cited scoring.**
5. **Metacognition BEFORE scoring** for honest self-prediction.
6. **Auto-harvest** to vocab.
7. **Subcap + error keys canonical.**
8. **No MEMORY writes.**
