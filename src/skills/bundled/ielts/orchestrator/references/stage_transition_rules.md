# Stage Transition Rules

Quantitative criteria for advancing between the four learning stages.
All criteria must be met simultaneously. The orchestrator loads this file before making any transition decision.

---

## Diagnose → Breakthrough

**Entry condition**: Baseline assessment is complete.

| Criterion | Threshold |
|---|---|
| Baseline assessment completed | Yes |
| All 4 skills have at least 1 band estimate | Yes |
| MEMORY `Path.type` is set | Yes |

**Notes**: This transition is typically immediate after init Phase 4 completes.

---

## Breakthrough → Integrate

The learner's primary weakness has stabilized enough to begin cross-skill integration.

| Criterion | Threshold |
|---|---|
| Primary driver subcap mean | ≥ 6.5 for 2 consecutive weeks |
| Primary driver subcap std | ≤ 0.4 |
| Last biweekly mock on primary skill | ≥ target - 1.0 |
| Total training sessions | ≥ 20 |
| At least 3 completed rewrite chains | Yes |

**Confirmation required**: A biweekly mock exam must confirm the improvement before the transition is finalized.

**Fallback**: If the biweekly mock shows regression (primary skill drops > 0.5), stay in Breakthrough and update the primary driver.

---

## Integrate → Sprint

The learner can perform stably across all skills under timed conditions.

| Criterion | Threshold |
|---|---|
| Full mock overall band | ≥ target - 0.5 |
| Full mock overall std (across last 3 mocks) | ≤ 0.3 |
| Trough (lowest single-skill score in last mock) | ≥ target - 1.0 |
| No skill has regressed > 0.5 in 2 weeks | Yes |
| Total mock sessions completed | ≥ 2 |

**Confirmation required**: A full mock exam is mandatory before entering Sprint.

---

## Sprint → Exam Ready (notification only)

This is not a system transition but a learner notification.

| Criterion | Threshold |
|---|---|
| Full mock overall band | ≥ target |
| Overall std (last 3 mocks) | ≤ 0.2 |
| All skills within 0.5 of target | Yes |
| No recurring error with count > 3 in last 2 weeks | Yes |

**Output**: Congratulatory message + exam booking reminder + continued maintenance plan suggestion.

---

## Demotion Rules

The system can also move a stage backward if performance degrades.

| Transition | Trigger |
|---|---|
| Integrate → Breakthrough | Primary skill drops > 1.0 band in 2 consecutive weeks |
| Sprint → Integrate | Full mock overall drops > 0.5 from previous mock |

**Demotion messaging**: Never say "you've been demoted." Frame as: "Let's reinforce the foundation before pushing further."

---

## Transition Record Format

Every transition writes to `stage_transitions`:

```sql
INSERT INTO stage_transitions (changed_at, from_stage, to_stage, from_path, to_path, reason, snapshot_path)
VALUES (datetime('now'), ?, ?, ?, ?, ?, ?)
```

And snapshots the current MEMORY.md state to `memory_snapshots/<iso_week>.md`.
