# Exam Metrics

Canonical metric definitions for `analysis-exam`. Every metric here has a stable name so reports across weeks can be compared.

## Identity

- `exam_id` — `mock_sessions.id` or synthesized `session_id` from `samples` (e.g. `listening-exam-1714000000`).
- `exam_kind` — one of `speaking-exam`, `listening-exam`, `reading-exam`, `writing-exam`, `placement-full`.
- `exam_date` — `created_at` of the earliest row in the session.

## Band metrics

| Key | Definition | Range |
| --- | ---------- | ----- |
| `band_overall` | End-of-exam Overall (weighted mean — writing uses T1×1 + T2×2 / 3) | 0.0–9.0 |
| `band_<skill>` | Per-skill band (listening, reading, writing, speaking) | 0.0–9.0 |
| `band_task` / `band_coherence` / `band_lexical` / `band_grammar` | 4D criteria, writing + speaking only | 0.0–9.0 |
| `band_delta_prev` | Current band − previous exam band | −9.0..+9.0 |
| `band_delta_avg3` | Current band − last-3-exam mean | −9.0..+9.0 |

## Section / task breakdown

- `section_accuracy[n]` — fraction correct in Listening / Reading section n (0.0–1.0).
- `question_type_accuracy[type]` — fraction correct for TFNG / Matching / Heading / MCQ / Completion / Short Answer / Map / Labelling.
- `word_count` — writing only, per task.
- `coverage_ratio` — writing only, 3-bullet coverage (GT T1) or prompt coverage (T2).

## Time management

- `reading_time_sec` — reading exam total time.
- `writing_time_sec_t1` / `_t2` — per-task time for writing.
- `overtime_flag` — boolean; true when time exceeded target.
- `pacing_variance` — std dev of per-question / per-section time (reading only).

## Stability (across last N exams)

- `band_std_<skill>` — standard deviation of per-skill bands across last 3-5 exams.
- `band_trough_7d_<skill>` — lowest band in last 7 days.
- `band_trough_30d_<skill>` — lowest in last 30 days.
- `stability_verdict`:
  - ✅ `stable` when `band_std ≤ 0.3` AND `trough_7d ≥ overall − 0.5`
  - ⚠️ `wavy` when `band_std ≤ 0.6`
  - 🔴 `unstable` otherwise

## Paraphrase / decoding indicators (derived)

- `paraphrase_hit_rate` — listening + reading: fraction of paraphrase-type questions correct.
- `connected_speech_hit_rate` — listening only: fraction of function-word / dictation-style questions correct.
- `argument_depth_proxy` — writing only: count of "assertion + example + explanation" patterns detected per body paragraph.

## Freshness

- `evidence_sample_n` — number of rows backing a metric. Don't report a trend if `n < 2`.
- `last_exam_at` — freshest `created_at`; flag `stale` if > 30 days.

## Mapping back to subcap keys

Many of these metrics feed `subcap_scores` (written by the exam skill). See `analysis-weakness/assets/subcap-catalog.md` for the canonical list. `analysis-exam` reads these but does not define new ones.
