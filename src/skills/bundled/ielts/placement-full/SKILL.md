---
name: placement-full
description: "40-50 min deep baseline across all four skills with confidence ratings and 2-week plan."
---

# Placement Full

Five phases, one skill at a time. Never runs without explicit opt-in.

## When to Use

- `完整评估 / full placement / 我想认真测一次 / baseline`
- Before an exam (recalibration)
- When `placement-quick` differs from existing MEMORY by ≥ 1.0

## Blueprint

| Phase | Task | Time | Load |
| ----- | ---- | ---- | ---- |
| 1 | Speaking Part 1 (4 Qs, voice) | 4 min | 2 |
| 2 | Speaking Part 2 (cue card, ≥ 1 min) | 5 min | 2 |
| 3 | Listening (2 sections) | 12 min | 3 |
| 4 | Reading (1 passage, 8 mixed Qs) | 15 min | 3 |
| 5 | Writing Task 2 (~250 words) | 15 min | 4 |

## Workflow

1. **Opt-in**: `[开始|placement_full_start]` `[先快速测|placement-quick]` `[取消|nav:main]`.
2. Create `session_id = "placement-full-<ts>"` reused across phases.
3. Run each phase; between phases offer `[继续|...]` or `[休息|...]`. Each phase writes its own `samples` + `subcap_scores` + `errors` rows.
4. After phase 5:
   - Compute per-skill band + Overall (nearest 0.5).
   - Compute `band_std` across session samples (low-n caveat).
   - Rank subcaps + top 5 errors.
5. Write MEMORY: full bands + `Calibration.profile_confidence = high / based_on = placement-full` + weak-dims + `Adaptive Training Controls.*` + top 5 errors.
6. Deliver report (see `analysis-exam/assets/report-templates.md`) + offer `[💬 让教练规划 2 周|coach-proactive]`.

Canonical keys: `analysis-weakness/assets/subcap-catalog.md` + `error-taxonomy.md`. Queries: `support/ielts-data-contract/references/queries.md`.

## Rules

1. **Consent required.**
2. **Same `session_id` across phases.**
3. **If stopped mid-phase**, write what you have; mark confidence `medium` + `based_on = placement-full (partial)`.
4. **Smooth bands** unless delta > 1.0 AND evidence is strong.
5. **Original content only.** No lifted Cambridge passages.
6. **Every subcap + error key is canonical.**
