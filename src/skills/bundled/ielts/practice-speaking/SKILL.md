---
name: practice-speaking
description: 'IELTS speaking: 6-mode layered training with pron_assess, micro drill, forced redo'
---

# Speaking Coach — 6-Mode Training System

## When to Use

- Learner says "口语", "speaking", "练口语", "学口语"
- Callback: `speaking` or any `speaking:*` mode callback
- Reply Keyboard tap: "🗣️ 口语"

## Data

All session, error, and band data live in `learner.db` (tables `samples` + `errors`).
Write through the `db` tool only — no JSON sidecar files.

Useful queries:

```
# Recent speaking sessions
db name=learner sql="SELECT id, created_at, band_overall FROM samples WHERE skill_type='speaking' ORDER BY created_at DESC LIMIT 5"

# Top recurring speaking errors
db name=learner sql="SELECT recurrence_key, category, COUNT(*) as count FROM errors e JOIN samples s ON e.sample_id=s.id WHERE s.skill_type='speaking' GROUP BY recurrence_key ORDER BY count DESC LIMIT 10"

# Inject 3 transferable challenge words for a topic
db name=vocab sql="SELECT word, definition FROM words WHERE topics LIKE ? AND mastery IN ('learning','known') AND transfer_level >= 2 ORDER BY is_user_word DESC, priority DESC, srs_due ASC LIMIT 3" params='["%<topic>%"]'
```

If a column is unfamiliar, call `db name=learner` (no sql) for a full schema dump.

## Mode Matrix → Reference Files

Each mode has its own deep workflow. After picking a mode, load the corresponding reference with `skill_view`.

| Mode               | Band    | Scaffolding | Tools                            | Callback              | Reference                                    |
| ------------------ | ------- | ----------- | -------------------------------- | --------------------- | -------------------------------------------- |
| **Shadowing**      | < 5.0   | Extreme     | `tts` + `pron_assess`            | `speaking:shadowing`  | `references/modes/shadowing.md`              |
| **Guided QA**      | 4.5-5.5 | High        | `tts` + `force_reply`            | `speaking:qa`         | `references/modes/guided-qa.md`              |
| **Cue Card Build** | 5.0-6.0 | Medium      | `tts` + `force_reply`            | `speaking:cuecard`    | `references/modes/cue-card-build.md`         |
| **Role-play**      | 4.5-6.0 | Medium      | `tts` + multi-turn `force_reply` | `speaking:roleplay`   | `references/modes/roleplay.md`               |
| **Retell**         | All     | Variable    | `tts` + `pron_assess`            | `speaking:retell`     | `references/modes/retell.md`                 |
| **Examiner Sim**   | 5.5+    | Low/None    | `tts` + `pron_assess`            | `speaking:exam`       | `references/modes/examiner-sim.md`           |

Load before executing:

```
skill_view name=practice-speaking file=references/modes/<mode>.md
```

Auxiliary references:

- `references/tts.md` — voice choices, dialogue mode, rate guidelines
- `references/upgrade-rules.md` — when to upgrade / downgrade modes

## Universal Workflow

Every session follows the 10-step universal training loop (see the shared reference at `practice` skill: `references/training_flow.md`). The skill-specific S3-S10 details live in each mode's reference file. Steps S1 + S2 + the mode-selection branch are shared:

### S1 — Context Load

1. `memory target=user action=read` → interests, goals
2. `memory target=memory action=read` → current speaking band, fluency, `pronunciation_weak`
3. Recent speaking samples + top errors (queries above)

### S2 — Mode Selection

If callback is `speaking:<mode>` → use that mode directly. Otherwise apply the auto-selection logic:

1. `fluency < 4.0` AND `pronunciation_weak` has multiple entries → **Shadowing**
2. `answer_length` consistently below target → **Guided QA**
3. Part 2 coverage < 60% in last 2 sessions → **Cue Card Build**
4. 3 consecutive Examiner Sim sessions → **Retell** or **Role-play** (alternate)
5. Default → **Examiner Sim**

Show the recommended mode + allow the learner to override:

```
[KEYBOARD:
🎯 推荐: 跟读=speaking:shadowing
🗣️ 问答=speaking:qa | 🎤 考官=speaking:exam
📋 提纲=speaking:cuecard | 🎭 对话=speaking:roleplay
🔄 复述=speaking:retell
]
```

### S3-S10 — Per Mode

Read the corresponding `references/modes/<mode>.md` file, then execute its S3-S10 steps. Each mode reference is self-contained and ends with a difficulty feedback keyboard.

## Telegram Interaction Style

- **Voice and text both accepted.** Voice is preferred but never reject text.
- **TTS every correction.** The learner needs to hear the right pronunciation.
- **`force_reply` per turn.** Links the answer to the prompt and avoids race conditions.
- **No text reply alongside `force_reply`.** Send the prompt, then wait.
- **`pron_assess` for all voice input** in Shadowing and Examiner Sim modes.
- **IPA next to every TTS pronunciation fix.**
- **`react` for lightweight ack** (e.g., 👍 on a correct redo) instead of full text.
- **`edit` to update an in-progress card** rather than sending a new message.

## Difficulty Feedback Keyboard (Mandatory)

Every session MUST end with:

```
[KEYBOARD:
😰 太难了=feedback_too_hard | 👌 刚好=feedback_just_right | 🥱 太简单=feedback_too_easy
]
```

Plus a mode-specific exit row (see each mode's reference for its variant).

## Rules

1. **Mode variety.** Don't run the same mode 3+ times in a row.
2. **Challenge words.** Inject recently learned L2+ vocabulary as challenge words.
3. **Micro Drill + Forced Redo are mandatory.** S8 + S9 must happen — no session ends without them.
4. **Difficulty feedback keyboard at every session end.** No exceptions.
5. **Record every session into `learner.db`**, even abandoned ones (S10).
