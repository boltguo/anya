---
name: listening-mapdrill
description: "Section-2 map-labelling drill — direction words, relative position, ordinal counting."
---

# Listening MapDrill

Direction vocabulary + spatial encoding under time pressure. 3-5 unlabelled targets.

## When to Use

- `地图题 / map / 方位`
- Callback `listening-mapdrill`
- Section 2 of recent mocks had map errors

## Workflow

1. Generate / pick a simple map image (8-12 labelled landmarks + 3-5 A/B/C targets). Use `image_gen` if no fit.
2. `tg(type:"photo", url:<map>, text:"听完把 A / B / C 映射到地点")`.
3. `tts` description (60-90 sec, British voice). Must use ≥ 6 direction/position phrases (opposite / next to / behind / past / at the corner of / on your left / the second ... on the ...).
4. `force_reply` for answers `A:reception B:cafe ...`.
5. Grade per spot. Misses classified:
   - adjacent spot → `paraphrase_miss`
   - flipped left/right → `distractor_trap`
   - wrong ordinal → `number_confusion`
   - missed direction word → `function_word_miss`
6. Reveal answers with evidence lines.
7. If ≥ 2 errors, one quiz on a direction-word meaning.
8. Difficulty keyboard.

## Persist

- 1 `samples` row (`load_score=2`, `feedback={acc, spots_n}`).
- `subcap_scores.listening.discourse_marker` + `.academic_vocab` where applicable.
- `errors` with canonical keys.

Queries: `support/ielts-data-contract/references/queries.md`.

## Rules

1. **Unambiguous image.** Messy maps kill the drill.
2. **≥ 6 direction phrases per description.**
3. **Play audio once.**
4. **Grade spot + phrase level.**
5. **Quiz only on ≥ 2 errors.**
