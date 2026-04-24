# Listening Exam — Workflow + Band Mapping

## S0 Consent

```
🎧 完整听力模考 (~40 min)
4 个 Section，40 题。开始后别暂停。
```
`[开始|listening_exam_start]` `[取消|nav:main]`.

## S1-S4 Per section

1. Send header + question list with the transcript hidden in `<tg-spoiler>`.
2. Play audio via `tts` segments (multi-speaker for S1 + S3 — British default, occasional US for S4).
3. Collect answers:
   - Fill-in / short answer → `force_reply` with numbered format.
   - MCQ → `quiz` per question.
   - Matching / labelling → `force_reply` `1:C 2:A 3:B`.
4. No replay. No pause. Move to next section.

## S5 Grade

- Auto-grade, case-insensitive. Accept common spelling variants for proper nouns only.
- Compute `/40` → band.

| Raw | Band |
| --- | ---- |
| 39-40 | 9.0 |
| 37-38 | 8.5 |
| 35-36 | 8.0 |
| 32-34 | 7.5 |
| 30-31 | 7.0 |
| 26-29 | 6.5 |
| 23-25 | 6.0 |
| 18-22 | 5.5 |
| 16-17 | 5.0 |
| 13-15 | 4.5 |
| 11-12 | 4.0 |

## S6 Report

```
📋 听力模考结果
原始 {{raw}}/40 → Band {{band}}

| Section | 正确 | 核心错因 |
|---|---|---|
| 1 | {{s1}}/10 | {{s1_err}} |
| 2 | {{s2}}/10 | {{s2_err}} |
| 3 | {{s3}}/10 | {{s3_err}} |
| 4 | {{s4}}/10 | {{s4_err}} |

▍ Top 2 最值得先练
  1. {{top_1}} → {{drill_1}}
  2. {{top_2}} → {{drill_2}}
```

## S7 Persist

- 1 `samples` row per section, shared `session_id`, load_score=3 per section.
- `subcap_scores` per session: `listening.connected_speech`, `.academic_vocab`, `.discourse_marker`, `.implied_meaning`, `.note_taking_stability`.
- `errors` with canonical keys: `spelling_error`, `number_confusion`, `paraphrase_miss`, `distractor_trap`, `speaker_switch_confusion`, `missed_plural_s`, `minimal_pair_confusion`, `function_word_miss`.
