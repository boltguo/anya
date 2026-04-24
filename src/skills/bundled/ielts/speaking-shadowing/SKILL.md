---
name: speaking-shadowing
description: "Phoneme-accuracy shadowing: TTS → voice repeat → pron_assess → one targeted fix."
---

# Speaking Shadowing

Each round targets exactly one pronunciation issue. Always calls `pron_assess`.

## When to Use

- `跟读 / 练发音 / shadow`
- Callback `speaking-shadowing`
- `fluency < 4.0` AND `pronunciation_weak` has ≥ 2 entries
- `speaking.pronunciation_intelligibility ≤ 5.0` after placement

## Workflow (3-5 sentences per group)

Per sentence:

1. `tts` target sentence (rate −10% only for < 5.5). Send text hidden via `<tg-spoiler>`.
2. `force_reply` prompt; wait for voice.
3. `pron_assess(audio, reference)` → find lowest-accuracy word. Classify the error.
4. ONE fix only — show IPA + issue label. `tts` the correct fragment.
5. Redo: `force_reply` "再跟读一次，注意 …". Call `pron_assess` again.
6. `react ✅` on improvement, `🔁` otherwise.

Sentence scaling: < 4.5 simple daily / 4.5-5.5 one subordinate / 5.5+ with ≥ 1 connected-speech feature.

Error → taxonomy key: stress → `word_stress` / `pronunciation_stress`; vowel → `pronunciation_vowel`; consonant → `pronunciation_consonant`; linking → `connected_speech_fail`.

After the group: wrap card with avg accuracy trend + top issue. Difficulty keyboard.

## Persist

**Follow `support/ielts-data-contract/references/post-practice-protocol.md` for all writes.** Do NOT update MEMORY.md — cron handles that via `learner-state`.

- 1 `samples` row per sentence (`load_score=1`, `feedback={first_acc, second_acc, weak_word}`).
- `subcap_scores.speaking.pronunciation_intelligibility` = avg second-attempt score mapped to band.
- 1 `errors` row per distinct issue + `root:language`.

Queries: `support/ielts-data-contract/references/queries.md`.

## Rules

1. **Always call `pron_assess`** — that's the point.
2. **One fix per round.**
3. **Hide target text behind `<tg-spoiler>`** — try from audio first.
4. **IPA hints** next to every fix.
5. **Rate −10% only for < 5.5.**
6. **Persist both attempts.**
