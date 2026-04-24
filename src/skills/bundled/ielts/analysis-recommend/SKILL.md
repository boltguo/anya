---
name: analysis-recommend
description: "Turn diagnostic output into one concrete next action for the learner."
---

# Analysis — Recommend

Synthesis layer. Reads the three diagnostics + MEMORY goals → dispatches ONE next action (or a 3-tier now/today/week plan) with a launch button.

## When to Use

- `下一步 / 接下来练什么 / 帮我规划 / plan my week`
- Callback `analysis-recommend` (from any analysis report's hand-off button)
- After `analysis-exam` / `analysis-study` / `analysis-weakness`

For conversational coaching use `coach-passive`; for scheduled nudges use `coach-proactive`.

## Workflow

1. Gather context (read-only via `skill_view` — don't re-run analyses if fresh):
   - `analysis-exam` latest snapshot (optional)
   - `analysis-study` streak + coverage + imbalance
   - `analysis-weakness` Top-5 subcaps + Top-5 errors + bottlenecks
   - MEMORY goals: `target_band`, `exam_date`, `weekly_hours`, `Preferences.Tone`
2. Apply strict-priority rules in `assets/recommendation-rules.md`. Exactly one fires.
3. Pick the skill callback from `assets/next-step-map.md` using the chosen rule's inputs (error key / subcap key / behaviour pattern).
4. Output:
   - **Minimal** (default): one-line reasoning + one action button.
   - **Structured** (when asked for a plan, or `exam_close` fires): now / today / week tiers with three buttons.
5. Record the recommendation as a thin `samples` row (`skill_type='analysis_recommend'`, `load_score=0`) so the next pass can dedupe.

## Rules

1. **Exactly one rule fires** — strict priority; never blend.
2. **At most 3 actions** (now / today / week) — usually 1.
3. **Every action has a callback.**
4. **Exam proximity wins.** `days_to_exam < 14` overrides everything else.
5. **Cite one piece of evidence** per recommendation.
6. **No MEMORY writes.**
7. **Re-running within 1 hour** with same inputs → return the same action (continuity > novelty).
