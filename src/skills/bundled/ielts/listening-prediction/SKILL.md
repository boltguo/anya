---
name: listening-prediction
description: "Predict the answer type before listening, then grade both the prediction and the final answer."
---

# Listening Prediction

Meta-strategy drill — why mid-band answers fail is rarely acoustic, it's "didn't know what to listen for".

## When to Use

- `预判 / prediction / 听前预判`
- Callback `listening-prediction`
- Recent `paraphrase_miss`, `distractor_trap`, `function_word_miss`

## Answer-type labels

`number / date / proper noun / countable noun / uncountable noun / adjective / verb / time expression`

## Workflow

1. Generate 5-8 fill-in questions from a short synthetic passage. Each blank must have a clear expected type.
2. Prediction round (no audio): send the questions; `force_reply` with format `1:time 2:countable 3:number ...`. Grade — if wrong, explain which grammatical cue pointed to the correct type.
3. Audio round: `tts` once, `force_reply` for answers.
4. Grade per question; for misses, tag root cause (`paraphrase_miss` / `distractor_trap` / `spelling_error` / `function_word_miss`) and show the evidence line.
5. Reveal full transcript via `<tg-spoiler>`.
6. Wrap: prediction acc + final acc + weakest type + recommended drill.

## Persist

- Two `samples` rows chained via `parent_sample_id` (prediction + audio); shared `session_id`.
- `subcap_scores.listening.academic_vocab` + `.discourse_marker`. `feedback` JSON stores `prediction_accuracy`.
- `errors` with canonical keys.

Queries: `support/ielts-data-contract/references/queries.md`.

## Rules

1. **Prediction is graded too.**
2. **Explain why** predictions were wrong (grammar cue).
3. **Reveal transcript only at end.**
4. **Audio plays once.**
5. **Recommend follow-up drill** tied to the weakest type (number → `listening-numberdrill`, map → `listening-mapdrill`, etc.).
