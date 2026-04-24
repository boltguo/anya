---
name: listening-dictation
description: "Sentence dictation drill: play once, diff, listen again, final redo — 3-5 sentences per session."
---

# Listening Dictation

Kills the three most common mid-band listening errors: function words dropped, spelling, connected-speech decoding.

## When to Use

- `听写 / 精听 / dictation`
- Callback `listening-dictation`
- Recent errors include `function_word_miss`, `spelling_error`, `connected_speech_fail`
- Weekly minimum (1 session per week for all bands)

## Sentence scaling

| Band | Profile |
| ---- | ------- |
| < 5.0 | 8-12 words, simple SVO |
| 5.0-5.5 | 12-18 words, one subordinate clause |
| 5.5-6.5 | 18-25 words, academic phrasing |
| 6.5+ | 20-30 words, ≥ 1 connected-speech feature |

## Workflow

Per sentence (3-5 total):

1. First listen once only (`tts`, rate −10% only if < 5.0).
2. `force_reply` — type what you heard.
3. Word-by-word diff. Classify each miss: `function_word_miss` / `missed_plural_s` / `spelling_error` / `connected_speech_fail` / `distractor_trap`.
4. Second listen + `force_reply` "再听一次，补漏的部分".
5. Show the correct sentence.
6. If paraphrase involved, 1 micro quiz on the synonym pair.
7. Final redo: type the corrected full sentence.

After 3-5 sentences: wrap with first-listen / final-redo accuracy + top error. Difficulty keyboard.

## Persist

- 1 `samples` row per session (`load_score=2`, `feedback={first_pct, final_pct}`).
- `subcap_scores.listening.connected_speech` (+ `.academic_vocab` for band 6+).
- `errors` per distinct diff with canonical key + root cause.
- Auto-harvest unknown words to `study.db`.

Queries: `support/ielts-data-contract/references/queries.md`.

## Rules

1. **First listen = one pass only.**
2. **Diff every word** — specific, not "great job".
3. **Classify every error** with canonical key + root cause.
4. **Final redo mandatory** unless perfect first pass.
5. **Rate −10% only for < 5.0.**
6. **Micro quiz only if paraphrase** is present.
7. **Persist partial data** if abandoned.
