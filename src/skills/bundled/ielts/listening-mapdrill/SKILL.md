---
name: listening-mapdrill
description: "Section-2 direction and spatial-relation drill — direction words, relative position, ordinal counting. Text-based."
---

# Listening MapDrill

Direction vocabulary + spatial encoding under time pressure. Pure text — no images.

## When to Use

- `地图题 / map / 方位`
- Callback `listening-mapdrill`
- Section 2 of recent mocks had map errors

## Adaptive Binding

Read MEMORY and apply:

| MEMORY parameter | Controls |
|---|---|
| `IELTS Bands.Listening` | `< 5.0` → 6-8 landmarks, 40-60s audio; `5.0-6.0` → 8-10, 60-90s; `6.0+` → 10-12, 90s+ |
| `Adaptive Training Controls.listening_passage_length` | Override audio duration if set |
| `Vocabulary Profile.cefr` | Cap direction vocabulary complexity |
| TTS rate | `< 5.0 → rate="-10%"` · `5.0-5.5 → rate="-5%"` · `> 5.5 → rate="+0%"` |

## Workflow

1. Describe a scene layout in text (campus / shopping mall / park / neighbourhood): list 8-12 named landmarks with relative positions (e.g. "图书馆在行政楼的东面，体育馆在图书馆对面"). Present as a numbered list.
2. `tts` a 60-90 sec audio description of a route / tour through the scene (British voice). Must use ≥ 6 direction/position phrases: opposite / next to / behind / past / at the corner of / on your left / the second ... on the ...
3. Ask 3-5 questions via `quiz`: "The speaker says the café is _____ the library" with 4 positional options.
4. Grade per question. Error classification:
   - adjacent spot → `paraphrase_miss`
   - flipped left/right → `distractor_trap`
   - wrong ordinal → `number_confusion`
   - missed direction word → `function_word_miss`
5. Reveal answers with the key audio phrases quoted.
6. If ≥ 2 errors, one extra quiz on a direction-word meaning.
7. Difficulty keyboard.

## Persist

**Follow `support/ielts-data-contract/references/post-practice-protocol.md` for all writes.** Do NOT update MEMORY.md — cron handles that via `learner-state`.

- 1 `samples` row (`load_score=2`, `feedback={acc, questions_n}`).
- `subcap_scores.listening.discourse_marker` + `.academic_vocab` where applicable.
- `errors` with canonical keys.

Queries: `support/ielts-data-contract/references/queries.md`.

## Rules

1. **No images.** Describe the scene layout entirely in text.
2. **≥ 6 direction phrases per audio description.**
3. **Play audio once.** User listens then answers quiz questions.
4. **Grade both position and phrase-level understanding.**
5. **Quiz only on ≥ 2 errors.**
6. **Listening tasks must use `tts` first.** Generate audio, then send via `tg(type=voice)`. Never show the direction script as text.
