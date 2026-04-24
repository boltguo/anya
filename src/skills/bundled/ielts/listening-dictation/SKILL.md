---
name: listening-dictation
description: "Sentence dictation drill: first-pass blind with optional spoiler hints, second-pass hinting, answer reveal with Chinese gloss, final redo — 3-5 sentences per session."
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
2. On the first attempt, spoiler-covered keywords / hints may be shown together with the prompt, but they must stay hidden by default so the learner can choose whether to reveal them.
3. `force_reply` — type what you heard.
4. Word-by-word diff. Classify each miss: `function_word_miss` / `missed_plural_s` / `spelling_error` / `connected_speech_fail` / `distractor_trap`.
5. If the learner stayed blind on the first attempt and is blocked, play the sentence again and encourage using the spoiler hints or give 2-4 keywords / chunks on the second attempt.
6. Prefer hidden hints when the interface allows it (for example spoiler-covered keywords) so the learner can choose whether to reveal them.
7. Second listen + `force_reply`: "再听一次，先自己试；需要的话再点开关键词提示。"
8. Show the correct sentence only if still blocked or after the second attempt.
9. When revealing the answer, always include a short Chinese translation.
10. If the learner likely does not know a phrase or chunk (for example `past`, `half past nine`), add a brief Chinese gloss / usage note.
11. If paraphrase involved, 1 micro quiz on the synonym pair.
12. Final redo: type the corrected full sentence.
13. If repeated failure continues, lower difficulty immediately (shorter sentence, slower rate only if profile allows, more transparent vocabulary).

After 3-5 sentences: wrap with first-listen / final-redo accuracy + top error. Difficulty keyboard.

## Persist

- 1 `samples` row per session (`load_score=2`, `feedback={first_pct, final_pct}`).
- `subcap_scores.listening.connected_speech` (+ `.academic_vocab` for band 6+).
- `errors` per distinct diff with canonical key + root cause.
- Auto-harvest unknown words / chunks to `study.db`, especially time expressions and high-frequency function-word patterns.
- Store whether the learner needed `spoiler_hint`, `keyword_hint`, `full_sentence_reveal`, `translation_support`, and `difficulty_drop` so later drills can resume with the right support ladder.

Queries: `support/ielts-data-contract/references/queries.md`.

## Rules

1. **First listen = one pass only.**
2. **First attempt may include spoiler-covered hints, but they must remain hidden by default.**
3. **Diff every word** — specific, not "great job".
4. **Classify every error** with canonical key + root cause.
5. **Use progressive hinting**: hidden spoiler hint available → second-pass keyword hint → full sentence.
6. **Prefer spoiler-covered hints** when possible.
7. **Answer reveal must include Chinese translation.**
8. **Unknown chunks should get a micro gloss**, not just the raw answer.
9. **Final redo mandatory** unless perfect first pass.
10. **Rate −10% only for < 5.0.**
11. **Micro quiz only if paraphrase** is present.
12. **Persist partial data** if abandoned.
13. **If the learner reports that answer exposure is helping recognition but not raw decoding, keep hints optional and hidden on the first attempt rather than visibly exposing them.**