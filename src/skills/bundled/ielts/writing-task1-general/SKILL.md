---
name: writing-task1-general
description: "GT Task 1 letter drill with register enforcement (formal / semi / informal)."
---

# Writing Task 1 (General)

20-min drill. Register mismatch is the #1 band-suppressor here.

## When to Use

- `letter / 写信 / task 1 信 / gt task 1`
- Callback `writing-task1-general`
- `Goals.exam_type = general`

## Letter types

Complaint / Application / Request for info / Apology / Invitation / Thank-you / Explanation. Each has a default register (formal / semi-formal / informal). Rotate across sessions.

## Workflow

1. Send scenario + 3 bullet points + register reminder ("Register: formal").
2. Start clock.
3. `force_reply` ≥ 150 words.
4. Pre-checks:
   - Word count < 150 → TR cap 5.0.
   - All 3 bullets covered? Miss → `task_response_off_topic`.
   - Opening / closing match register? Mismatch → `register_mismatch`, `formality_level`.
5. 4-criterion score, emphasising TA (bullets + register + length) and CC (open/middle/close + transitions).
6. Top 2 fixes + Band-up. Watch for register mixing + Chinglish politeness.
7. Micro drill (rewrite opening + closing to unify register) + forced rewrite.

## Persist

**Follow `support/ielts-data-contract/references/post-practice-protocol.md` for all writes.** Do NOT update MEMORY.md — cron handles that via `learner-state`.

- 1 `samples` row (`feedback={word_count, time_sec, register, bullets_covered, opening_correct, closing_correct}`).
- `subcap_scores` all 7 writing keys.
- `errors`: `register_mismatch`, `formality_level`, `hedging`, `directness`.
- Auto-harvest register-appropriate chunks.

Queries: `support/ielts-data-contract/references/queries.md`.

## Rules

1. **State register up front.**
2. **Three bullets covered.**
3. **Opening + closing match register.**
4. **Rotate letter types.**
5. **Forced rewrite mandatory** unless first draft is 7.0+.
