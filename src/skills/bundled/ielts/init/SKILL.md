---
name: init
description: 'First-run onboarding: learner profile setup + lightweight level calibration'
command: true
---

# Initialization Wizard

Use when:

- learner triggers `/init`
- `USER.initialized = false`
- `MEMORY.initialized = false`
- a skill flow is about to start but the learner has no usable initial profile yet

## Workflow

1. Read `USER.md` and `MEMORY.md`
2. Run the user profile flow from `references/user-profile.md`
3. Write `USER.md`
4. Run the lightweight starting calibration from `references/baseline-assessment.md`
5. Write `MEMORY.md`
6. Hand off to the `practice` skill

Always load the reference file right before running that phase with `skill_view`.

## Phase Order

| Phase | Goal                                 | Reference                           |
| ----- | ------------------------------------ | ----------------------------------- |
| 1     | Learner profile collection           | `references/user-profile.md`        |
| 2     | Persist USER.md (inside Phase 1 ref) | `references/user-profile.md`        |
| 3     | Lightweight calibration + MEMORY write | `references/baseline-assessment.md` |
| 4     | Hand off to practice                 | `practice`                          |

Run them in order. Don't skip. The interception rule applies if any earlier phase is incomplete when a later one is requested.

## Final Step

After profile setup and lightweight calibration are complete, do not build a custom wrap-up keyboard here.

Instead:

1. Send one short transition message, for example:

```text
设置完成 ✅
我会先按你现在的大致水平来出题，后面会边练边校准。
```

2. Immediately read the `practice` skill and hand off to it.

Recommended handoff instruction:

```text
Read the `practice` skill and execute it now. Show the normal direct practice menu for the learner.
```

The practice skill is the single source of truth for the training hub and its keyboard.
Do not duplicate that UI in `init`.

## Rules

1. Never ask for a slot already known.
2. All memory writes through the `memory` tool — never create stray files.
3. USER data → `memory(target="user", action=...)`. MEMORY data → `memory(target="memory", action=...)`.
4. Calibration is lightweight, not a test. Prefer known score or self-report over forced mini-exams.
5. If a callback fails → Reply Keyboard fallback immediately.
6. Never end mid-init without writing what has been captured so far.
7. Keep init short. It should feel like onboarding, not a questionnaire.
