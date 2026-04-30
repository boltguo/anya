---
name: ielts-band-descriptors
description: "[SUPPORT] Official IELTS band descriptors, scoring rubrics, and raw-to-band conversion tables. Load via skill_view when any exam or scoring skill needs the standard criteria."
---

# IELTS Band Descriptors

Canonical scoring reference for all IELTS skills. Contains the four-criterion rubrics for Speaking and Writing, the raw-to-band conversion tables for Listening and Reading, and the overall band calculation rule.

## When to Use

- `speaking-explain` / `writing-explain` need to justify why a band was given
- Any skill needs to convert a raw /40 score to a band
- Any skill needs the overall band rounding rule

## Resources

- `references/speaking-rubric.md` — FC / LR / GRA / PR descriptors (Band 4–9)
- `references/writing-rubric.md` — TA(TR) / CC / LR / GRA descriptors (Band 3–9) + hard caps
- `references/score-conversion.md` — Listening + Academic Reading + GT Reading raw → band tables + overall calculation

## Rules

1. **This skill NEVER talks to the learner directly.** It is a pure reference, loaded by other skills.
2. **Always caveat band estimates** — these are approximate conversions, not official Cambridge scores.
3. **Speaking text-based practice**: mark Pronunciation as N/A, average over FC + LR + GRA only.
4. **Writing hard caps**: No overview → TA capped at 5; under word count → penalty; memorized phrases → LR capped at 5-6.
5. **Overall band** = mean of 4 sections, rounded to nearest 0.5 (0.25 rounds up).
