---
name: placement-quick
description: "10-minute mixed-skill baseline to give the learner a starting band."
---

# Placement Quick

4 mini-tasks, one per track, ~10 min total. Feels like a warm-up, not an exam.

## When to Use

- First-run, right after `profile-manager` finishes (auto-chained)
- `快速测 / 先给我测 / quick placement / 我想知道我几分`
- MEMORY `IELTS Bands.Overall` missing OR `Calibration.profile_confidence = low`


## Blueprint

| # | Skill | Task | Time | Subcap signals |
| - | ----- | ---- | ---- | -------------- |
| 1 | Speaking | 30-sec Part 1 answer (voice) | 1 min | fluency + pronunciation |
| 2 | Listening | 2 dictations (simple + mid) | 3 min | connected_speech + academic_vocab |
| 3 | Reading | 150-word passage + 3 Qs (TFNG + paraphrase) | 3 min | gist + paraphrase_mapping |
| 4 | Writing | 50-80 word opinion sentence | 3 min | task_response + grammar_accuracy |

## Workflow

1. Greet + confirm. One `[准备好了|placement_quick_start]` + `[等一下|nav:main]`.
2. Run tasks 1 → 4 in order. Each → 1 `samples` row + 1-2 `subcap_scores`. No mid-test scoring.
3. Aggregate: per-skill bands (nearest 0.5) + Overall (mean, nearest 0.5) + top weak dim per skill.
4. Write MEMORY:
   - `IELTS Bands.*` + `updated`
   - `Calibration.profile_confidence = medium`, `based_on = placement-quick`, `latest_score_update = today`
   - `Weak Dimensions.<skill>` (only with evidence)
   - `Adaptive Training Controls.recommended_difficulty` + `.recommended_support_level`
5. Report + hand-off button.

Support-level mapping: `<4.5 high | 4.5-5.5 medium-high | 5.5-6.5 medium | 6.5+ low`.

Canonical subcap keys: `analysis-weakness/assets/subcap-catalog.md`. Queries: `support/ielts-data-contract/references/queries.md`.

## Rules

1. **No countdowns, no red X's.**
2. **4 tasks / 10 min max.** If abandoned, write what you have and exit cleanly.
3. **Round to 0.5.** Keep spread modest (±0.5 around mean).
4. **Smooth against prior MEMORY values** if any exist.
5. **Pick topic from `Content Profile.engage`**; avoid `Content Profile.avoid`.
6. **Always follow with one concrete next action.**
7. **Listening tasks must use `tts` first.** Generate audio via `tts` tool, then send it via `tg(type=voice)`. Never show the dictation sentence as text — the user must hear it, not read it.
