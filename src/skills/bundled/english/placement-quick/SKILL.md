---
name: placement-quick
description: "10-minute mixed-skill baseline to give the learner a starting English band snapshot."
---

# Placement Quick

A ~10 min adaptive baseline test to give the learner a starting English band snapshot.

## When to Use

- First-run, right after `profile-manager` finishes (auto-chained)
- `快速测 / 先给我测 / quick placement / 我想知道我几分`
- MEMORY `Band Snapshot.Overall` missing OR `Calibration.profile_confidence = low`

## Workflow

1. Greet + confirm. One `[准备好了|placement_quick_start]` + `[等一下|nav:main]`.
2. **Adaptive Listening (3 turns)**: 
   - Read the user's self-reported level from `USER.md` (`Current Background` section). If no level is present, start easy and calibrate conservatively.
   - Turn 1: Generate a dictation sentence (via `tts`) matching their self-reported level.
   - Turn 2 & 3: Adapt. If they struggle ("听不懂"), lower the vocabulary/speed. If they ace it, increase the difficulty (complex grammar, academic vocab). Do this 3 times to pinpoint their listening band.
3. **Speaking (2 turns)**:
   - Turn 1 (Read Aloud): Provide a short, level-appropriate paragraph. Ask the user to read it aloud and send a voice message. Once received, use the `pron_assess` tool (with the paragraph as reference text) to evaluate their pronunciation, rhythm, and intonation.
   - Turn 2 (Q&A): Ask a spontaneous Part 1 question based on their hobbies (`USER.md`). Ask them to reply with a voice message. Evaluate their spoken grammar, fluency, and vocabulary.
4. **Reading & Writing (1 turn each)**:
   - Reading: A short 150-word passage matching their estimated level with 2-3 questions (TFNG/paraphrase).
   - Writing: Ask them to write a 50-word opinion on a familiar topic.
5. Aggregate: per-skill bands (nearest 0.5) + Overall (mean, nearest 0.5) + top weak dim per skill.
6. Write MEMORY:
   - `Band Snapshot.*` + `updated`
   - `Calibration.profile_confidence = medium`, `based_on = placement-quick`, `latest_score_update = today`
   - `Weak Dimensions.<skill>` (only with evidence)
   - `Adaptive Training Controls.recommended_difficulty` + `.recommended_support_level`
7. Report + hand-off button.

Support-level mapping: `<4.5 high | 4.5-5.5 medium-high | 5.5-6.5 medium | 6.5+ low`.

## Rules

1. **No countdowns, no red X's.** Keep it feeling like a warm-up.
2. **Dynamic Adaptation**: Always adjust the next question's difficulty based on the previous answer's performance.
3. **Round to 0.5.** Keep spread modest (±0.5 around mean).
4. **Pick topics from the user's interests in `USER.md`**; avoid topics the user has said they dislike or find sensitive.
5. **Always follow with one concrete next action.**
6. **Listening tasks must use `tts` first.** Generate audio via `tts` tool, then send it via `tg_msg(type=voice)`. Never show the dictation sentence as text — the user must hear it, not read it.
