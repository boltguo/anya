# Reading Exam — Workflow + Band Mapping

## S0 Consent

```
📖 完整阅读模考 — 60 分钟 / 3 篇 / 40 题
开始之后计时不会停。
```
`[开始|reading_exam_start]` `[取消|nav:main]`.

## S1-S3 Per passage

1. Send passage wrapped in `<blockquote expandable>` + question set (labelled question types).
2. `force_reply` with format `1:T 2:F 3:NG 4:<word> 5:<letter> ...`.
3. No mid-passage grading. Move to next.

## S4 Grade

- Auto-grade, case-insensitive. Accept common spelling variants for proper nouns unless they're the question.
- Compute `/40` → band.

| Raw | Academic | GT |
| --- | -------- | -- |
| 39-40 | 9.0 | 9.0 |
| 37-38 | 8.5 | 8.5 |
| 35-36 | 8.0 | 8.0 |
| 33-34 | 7.5 | 7.0 |
| 30-32 | 7.0 | 6.5 |
| 27-29 | 6.5 | 6.0 |
| 23-26 | 6.0 | 5.5 |
| 19-22 | 5.5 | 5.0 |
| 15-18 | 5.0 | 4.5 |
| 13-14 | 4.5 | 4.0 |

## S5 Report

```
📋 阅读模考结果
原始 {{raw}}/40 → Band {{band}}
用时 {{minutes}} 分 · 速度 {{wpm}} wpm

| 段 | 正确 | 核心错因 |
|---|---|---|
| P1 | {{p1}}/13 | {{p1_err}} |
| P2 | {{p2}}/14 | {{p2_err}} |
| P3 | {{p3}}/13 | {{p3_err}} |

▍ 各题型命中率
  TFNG {{tfng}}% · Matching {{match}}% · Heading {{head}}% · Completion {{comp}}% · MCQ {{mcq}}%

▍ Top 2 提分点
  1. {{top_1}} → {{drill_1}}
  2. {{top_2}} → {{drill_2}}
```

## S6 Persist

- 1 `samples` row per passage, shared `session_id`, `load_score=3` each.
- `feedback` JSON: `{reading_time_sec, wpm, word_count, question_types, question_accuracy, re_reads, location_accuracy, overtime}`.
- `subcap_scores`: `reading.gist`, `.paraphrase_mapping`, `.sentence_anatomy`, `.pace`, `.author_attitude` (if attitude Qs appeared).
- `errors` with canonical keys: `tfng_logic_error`, `heading_mismatch`, `keyword_matching_error`, `detail_location_fail`, `speed_too_slow`, `inference_error`, `author_attitude_miss`, `argument_structure_miss`.
