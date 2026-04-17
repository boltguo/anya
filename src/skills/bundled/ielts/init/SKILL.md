---
name: init
description: 'First-run wizard: profile setup + IELTS baseline assessment'
command: true
---

# Initialization Wizard

## When to Use

- Learner manually triggers `/init`
- `USER.initialized = false` OR `MEMORY.initialized = false`
- Any core slot in USER or MEMORY shows `(not set)`
- **Interception rule**: if a learner sends any skill-routed message and either flag is `false` → intercept, run init first, then offer to continue with the original intent

## Resources

- `templates/USER.template.md` — full USER.md schema
- `templates/MEMORY.template.md` — full MEMORY.md schema
- `references/phase1-agent-setup.md` — agent name + style picker
- `references/phase2-profile.md` — 10-step learner profile + Phase 3 persist
- `references/phase4-assessment.md` — 5-step baseline + MEMORY write

Load each phase reference with `skill_view` right before running it:

```
skill_view name=init file=references/phase1-agent-setup.md
```

## Data

- USER profile → `memory target=user action=read|append|replace`
- MEMORY learner state → `memory target=memory action=read|append|replace`

Never write to `USER.md` / `MEMORY.md` directly — always go through the `memory` tool.

## Core Principles

1. **Audit before asking.** Read USER and MEMORY first. Skip already-known slots.
2. **One slot per turn.** Keep the conversation flowing — don't dump questions.
3. **Buttons are shortcuts, not the only way.** Every inline keyboard step includes a note that the learner can just type their answer instead. No "✍️ 自定义" button — mention it in the message text.
4. **Friendly chat tone.** These are not form fields. Each step should feel like a natural question from a friend.
5. **Write both files after Phase 2.** USER.md + MEMORY.md should be updated before assessment.
6. **Initialization is only complete when BOTH `USER.initialized = true` AND `MEMORY.initialized = true`.** A single file being true is not enough — the system must check both before allowing skill routing.

## Phase Order

| Phase | Goal                                  | Reference                            |
| ----- | ------------------------------------- | ------------------------------------ |
| 1     | Agent name + style                    | `references/phase1-agent-setup.md`   |
| 2     | 10-step learner profile               | `references/phase2-profile.md`       |
| 3     | Persist USER.md (inside Phase 2 ref)  | `references/phase2-profile.md`       |
| 4     | Baseline assessment + MEMORY write    | `references/phase4-assessment.md`    |
| 4B    | Path assignment + first day tasks     | (auto-trigger orchestrator)          |
| 5     | Wrap-up entry point (below)           | (in this file)                       |

Run them in order. Don't skip. The interception rule applies if any earlier phase is incomplete when a later one is requested.

## Phase 4B — Path Assignment (Auto)

Immediately after Phase 4 writes MEMORY bands, trigger the orchestrator for first-time setup:

1. Orchestrator determines initial `Path.type` (A/B/C) based on baseline bands
2. Orchestrator sets `Current Stage` to `breakthrough` (diagnose is considered done)
3. Orchestrator generates first day's 3 tasks and writes `daily_tasks`
4. Orchestrator writes `Daily Load.budget` based on path type

No separate message to learner — the results are shown in Phase 5.

## Phase 5 — Wrap Up

Send one message via the native adapter summarizing the learner's starting point:

```
设置完成 ✅

📊 你的起点: {{overall_band}} ({{path_label}})
🎯 当前阶段: {{stage_label}}
📋 今日负荷预算: {{budget}}

今天推荐先做:
🔴 {{primary_task}}

[KEYBOARD:
🎯 开始今日训练=practice | 📊 查看画像=assessment
✍️ 写作=writing | 🗣️ 口语=speaking
📖 阅读=reading | 🎧 听力=listening
📚 单词=words
]
```

Path labels: A=基础重建 / B=高原突破 / C=冲刺精进
Stage labels: diagnose=诊断期 / breakthrough=突破期 / integrate=整合期 / sprint=冲刺期

## Telegram Interaction Style

- **`force_reply`** for open text input (name, strengths/weaknesses, free-form answers).
- **Inline Keyboard** for choices — always add "(也可以直接发消息)" so the learner knows they can type instead.
- **Reply Keyboard fallback** if a callback fails.
- **No "✍️ 自定义" button** — say it in the message text, not as a button.
- **Native adapter** (`[native]`) for Phase 1 + Phase 2 force-reply prompts so the bot identity feels consistent before the agent fully takes over.

## Post-Init: Gap Detection

If a session reveals any `(not set)` slot relevant to the current task, ask naturally — one slot at a time, in context.

## Completion Checklist

- `USER.Status.initialized = true`
- `MEMORY.Status.initialized = true`
- `USER.Identity.Name` is not `(not set)`
- `USER.Goals.IELTS target` is not `(not set)`
- `USER.Preferences.Tone` is not `(not set)`
- USER.md captures the learner's preferred agent name / coach style if specified
- MEMORY has rough band estimates from assessment

## Rules

1. Never ask for a slot already known.
2. All memory writes through the `memory` tool — never create stray files.
3. USER data → `memory(target="user", action=...)`. MEMORY data → `memory(target="memory", action=...)`.
4. Assessment is mandatory — run it after Phase 2, no skipping.
5. If a callback fails → Reply Keyboard fallback immediately.
6. Never end mid-init without writing what has been captured so far.
