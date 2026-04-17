---
name: practice-speaking
description: 'IELTS speaking: 6-mode layered training with pron_assess, Part2/3 structure feedback, material bank, micro drill, forced redo, subcap profiling'
---

# Speaking Coach — 6-Mode Training System

## Pedagogical Foundation

- **Ericsson Deliberate Practice**: Same-topic redo with targeted structure feedback
- **Swain Output Hypothesis**: Forced independent spoken output, no template recitation
- **Shadowing (Arguelles)**: Simultaneous listening-speaking for pronunciation + fluency
- **Schmidt Noticing**: IPA + contrastive pronunciation feedback forces noticing
- **Stability > Single Performance**: Upgrade rules require sustained quality, not one-off success

## When to Use

- Learner says "口语", "speaking", "练口语", "学口语"
- Callback: `speaking` or any `speaking:*` mode callback
- Reply Keyboard tap: "🗣️ 口语"

## Data

All session, error, and band data live in `learner.db` (tables `samples` + `errors` + `subcap_scores`).
Write through the `db` tool only — no JSON sidecar files.

Useful queries:

```
# Recent speaking sessions
db name=learner sql="SELECT id, created_at, band_overall FROM samples WHERE skill_type='speaking' ORDER BY created_at DESC LIMIT 5"

# Top recurring speaking errors
db name=learner sql="SELECT recurrence_key, category, COUNT(*) as count FROM errors e JOIN samples s ON e.sample_id=s.id WHERE s.skill_type='speaking' GROUP BY recurrence_key ORDER BY count DESC LIMIT 10"

# Inject 3 transferable challenge words for a topic
db name=vocab sql="SELECT word, definition FROM words WHERE topics LIKE ? AND mastery IN ('learning','known') AND transfer_level >= 2 ORDER BY is_user_word DESC, priority DESC, srs_due ASC LIMIT 3" params='["%<topic>%"]'

# Read material bank entries
db name=learner sql="SELECT raw_content FROM samples WHERE skill_type='material_bank' ORDER BY created_at DESC LIMIT 10"
```

If a column is unfamiliar, call `db name=learner` (no sql) for a full schema dump.

## Mode Matrix → Reference Files

Each mode has its own deep workflow. After picking a mode, load the corresponding reference with `skill_view`.

| Mode               | Band    | Scaffolding | Tools                            | Callback              | load_score | Reference                                    |
| ------------------ | ------- | ----------- | -------------------------------- | --------------------- | ---------- | -------------------------------------------- |
| **Shadowing**      | < 5.0   | Extreme     | `tts` + `pron_assess`            | `speaking:shadowing`  | 1          | `references/modes/shadowing.md`              |
| **Guided QA**      | 4.5-5.5 | High        | `tts` + `force_reply`            | `speaking:qa`         | 2          | `references/modes/guided-qa.md`              |
| **Cue Card Build** | 5.0-6.0 | Medium      | `tts` + `force_reply`            | `speaking:cuecard`    | 3          | `references/modes/cue-card-build.md`         |
| **Role-play**      | 4.5-6.0 | Medium      | `tts` + multi-turn `force_reply` | `speaking:roleplay`   | 3          | `references/modes/roleplay.md`               |
| **Retell**         | All     | Variable    | `tts` + `pron_assess`            | `speaking:retell`     | 2          | `references/modes/retell.md`                 |
| **Examiner Sim**   | 5.5+    | Low/None    | `tts` + `pron_assess`            | `speaking:exam`       | 4          | `references/modes/examiner-sim.md`           |

Load before executing:

```
skill_view name=practice-speaking file=references/modes/<mode>.md
```

Auxiliary references:

- `references/tts.md` — voice choices, dialogue mode, rate guidelines
- `references/upgrade-rules.md` — when to upgrade / downgrade modes
- `references/material_bank.md` — user personal material bank protocol

## Universal Workflow

Every session follows the 10-step universal training loop. The skill-specific S3-S10 details live in each mode's reference file. Steps S1 + S2 + the mode-selection branch are shared:

### S1 — Context Load

1. `memory target=user action=read` → interests, goals
2. `memory target=memory action=read` → current speaking band, fluency, `pronunciation_weak`, Path type, Daily Load remaining
3. Recent speaking samples + top errors (queries above)

### S2 — Mode Selection

If callback is `speaking:<mode>` → use that mode directly. Otherwise apply the auto-selection logic:

1. `fluency < 4.0` AND `pronunciation_weak` has multiple entries → **Shadowing**
2. `answer_length` consistently below target → **Guided QA**
3. Part 2 coverage < 60% in last 2 sessions → **Cue Card Build**
4. 3 consecutive Examiner Sim sessions → **Retell** or **Role-play** (alternate)
5. If Daily Load remaining < mode's load_score → suggest **Shadowing** (load_score=1) or **Retell** (load_score=2)
6. Default → **Examiner Sim**

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

## Structure Feedback (All Modes)

In addition to mode-specific feedback, every response must be evaluated for structure:

### Part 2 Responses — Story Five Elements

Check and tag each element: Setting / Character / Conflict / Resolution / Feeling

```
📋 结构分析:
  ✅ 场景 (Setting)     — "Last summer in Beijing..."
  ✅ 人物 (Character)    — "my best friend"
  ⚠️ 冲突 (Conflict)    — weak, implied but not stated
  ❌ 解决 (Resolution)   — missing
  ✅ 感受 (Feeling)      — "I felt really grateful"

💡 Try: "The difficult part was..." → "But eventually we..."
```

Tag `part2_structure_weak` if ≤ 3/5 elements present.

### Part 3 Responses — OEE Skeleton

Check: Opinion / Explanation / Example

```
📋 结构分析:
  ✅ 观点 (Opinion)     — "I think education is crucial"
  ⚠️ 解释 (Explanation) — too brief
  ❌ 举例 (Example)     — none given

💡 Try the OEE pattern:
  "I believe... because... For instance..."
```

Tag `part3_abstraction_gap` if explanation is personal anecdote instead of societal analysis.

## Subcap Scoring (S10)

After every session, write subcap_scores:

```
db name=learner sql="INSERT INTO subcap_scores (sample_id, subcap_key, score, evidence, created_at) VALUES (?, ?, ?, ?, datetime('now'))"
```

Keys to evaluate:
- `speaking.fluency_pauses` — pause density + filler count
- `speaking.pronunciation_intelligibility` — from pron_assess if available
- `speaking.part2_structure` — story five-element coverage (Part 2 only)
- `speaking.part3_abstraction` — OEE quality (Part 3 only)
- `speaking.lexical_variety` — word repetition rate
- `speaking.grammar_accuracy` — error density
- `speaking.interaction` — follow-up response quality

## Material Bank

The learner has a personal material bank of reusable stories, places, people, and objects. See `references/material_bank.md` for the protocol.

When generating Part 2/3 prompts:
1. Check material bank for relevant entries
2. Suggest the learner draw from their stored experiences
3. After a good response, offer to save new material to the bank

## Metacognitive Hook (Before Scoring)

```
tg(type:"force_reply", text:"你觉得这次口语大概几分？（直接输入数字，如 5.5）")
```

Record the gap between prediction and actual score. Store `abs(prediction - actual)` in MEMORY `Metacognition.self_prediction_gap` (running average). Never mark the learner's prediction as "wrong".

## Session Completion (S10 — All Modes)

After recording the sample, mark daily_task completed and persist difficulty feedback:

```
db name=learner sql="UPDATE daily_tasks SET completed = 1, completed_at = datetime('now'), sample_id = ? WHERE id = (SELECT id FROM daily_tasks WHERE date = date('now') AND skill = 'speaking' AND completed = 0 LIMIT 1)" params='[<sample_id>]'
```

Persist difficulty feedback when learner taps button:

```
db name=learner sql="UPDATE samples SET feedback = json_set(COALESCE(feedback,'{}'), '$.difficulty', ?) WHERE id = ?" params='["just_right", <sample_id>]'
```

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
6. **Structure feedback is mandatory.** Part 2 → five elements; Part 3 → OEE.
7. **Subcap scores written every session.** Use only keys from subcap_catalog.md.
8. **Material bank integration.** Check existing materials before generating prompts.
9. **Load score respected.** If daily budget nearly consumed, suggest low-intensity modes.
