---
name: practice-writing
description: 'IELTS writing: brainstorming + TEEL scaffold + forced rewrite loop + Task 1/2'
---

# Writing Coach — Scaffolded Rewrite System

## When to Use

- Learner says "写作", "writing", "练写作", "学写作", "作文", "写essay"
- Callback: `writing` or any `writing:*` mode callback
- Reply Keyboard tap: "✍️ 写作"

## Data

All session, error, and band data live in `learner.db` (tables `samples` + `errors`).
Write through the `db` tool only — no JSON sidecar files.

Useful queries:

```
# Recent writing sessions
db name=learner sql="SELECT id, created_at, band_overall FROM samples WHERE skill_type='writing' ORDER BY created_at DESC LIMIT 5"

# Top recurring writing errors
db name=learner sql="SELECT recurrence_key, category, COUNT(*) as count FROM errors e JOIN samples s ON e.sample_id=s.id WHERE s.skill_type='writing' GROUP BY recurrence_key ORDER BY count DESC LIMIT 10"

# Inject 3 transferable challenge words for a topic
db name=vocab sql="SELECT word, definition FROM words WHERE topics LIKE ? AND mastery IN ('learning','known') AND transfer_level >= 2 ORDER BY is_user_word DESC, priority DESC, srs_due ASC LIMIT 3" params='["%<topic>%"]'
```

If a column is unfamiliar, call `db name=learner` (no sql) for a full schema dump.

## Mode Matrix → Reference Files

| Phase          | Mode                       | When                             | Callback           | Reference                                |
| -------------- | -------------------------- | -------------------------------- | ------------------ | ---------------------------------------- |
| **Cold start** | Brainstorming              | band < 5.5, brain blank          | `writing:brain`    | `references/modes/brainstorming.md`      |
| **Paragraph**  | TEEL Drill                 | Logic scattered, can't structure | `writing:teel`     | `references/modes/teel.md`               |
| **Full task**  | Full Task + Forced Rewrite | Regular training                 | `writing`          | `references/modes/full-task.md`          |
| **Task 1**     | Chart Description          | Task 1 practice                  | (via S2 decision)  | `references/modes/full-task.md` (Task 1) |

Load before executing:

```
skill_view name=practice-writing file=references/modes/<mode>.md
```

## Universal Workflow

### S1 — Context Load

1. `memory target=user action=read` → interests
2. `memory target=memory action=read` → current writing band, weak dimensions
3. Recent writing samples + top errors (queries above)

### S2 — Decision Engine

Decide task type:

- **Task 1** (150+ words): chart, graph, table, map, process
- **Task 2** (250+ words): opinion, discussion, problem-solution, advantages-disadvantages

Target difficulty = current band + 0.5.

Routing rules:

- band < 5.5 → **force Brainstorming phase** (`references/modes/brainstorming.md`) before writing
- band ≥ 5.5 → direct to Full Task
- `paragraph_structure_weak` or `topic_sentence_weak` in recent errors → suggest TEEL Drill
- Callback `writing:teel` → TEEL Drill mode

### S3-S5 — Per Mode

Read the corresponding `references/modes/<mode>.md`, then execute its S3-S5. Then continue to the shared S6-S10 below.

## Shared Steps (All Modes)

### S6 — 4D Scoring + Diff Highlight

| Criterion                | Score   |
| ------------------------ | ------- |
| Task Response            | X.0     |
| Coherence & Cohesion     | X.0     |
| Lexical Resource         | X.0     |
| Grammar Range & Accuracy | X.0     |
| **Overall**              | **X.0** |

Highlight specific issues with diff markers:

```
❌ "This is ~bad~ for environment"
✅ "This is **detrimental** to **the** environment"
```

### S7 — Focused Feedback (1-2 core bottlenecks only)

Do NOT list 10 errors. Pick the **1-2 most impactful** issues:

- Example: "缺连接词" + "bad 太低级"
- Show Band-Up: current sentence → +1.0 band version

### S8 — Micro Drill

Target the #1 bottleneck with a mini-exercise:

```
tg(type:"force_reply", text:"用 detrimental 替换 bad，造一个新句子")
```

Verify the response. If wrong, give one correction and move on.

### S9 — Forced Rewrite (**不重写完不准下课**)

```
tg(type:"force_reply", text:"带着新的连接词和高级词汇，把整个段落重写一遍发给我")
```

**AI Compare**: initial draft vs rewrite.

If improved (≥ +0.5 band on any dimension):

```
tg(type:"react", emoji:"🎉")
```

→ Celebrate + proceed to S10.

If NOT improved:

```
"再试一次 — 试试在开头加 Consequently，把 good 换成 beneficial"
```

→ One more rewrite attempt. Max 2 rewrites, then move on with encouragement.

### S10 — Record + Difficulty Feedback

```
db name=learner sql="INSERT INTO samples (created_at, skill_type, prompt, band_task, band_coherence, band_lexical, band_grammar, band_overall, session_id) VALUES (datetime('now'), 'writing', ?, ?, ?, ?, ?, ?, ?)" params='["<mode>", null, null, null, null, null, "<session_id>"]'

db name=learner sql="INSERT INTO errors (sample_id, recurrence_key, category, severity, original_phrase, correction) VALUES (?, ?, ?, ?, ?, ?)" params='[<sample_id>, "<key>", "<cat>", "<sev>", "...", "..."]'
```

```
[KEYBOARD:
😰 太难了=feedback_too_hard | 👌 刚好=feedback_just_right | 🥱 太简单=feedback_too_easy
🔁 再来一题=writing | 🏠 返回菜单=menu
]
```

## Telegram Interaction Style

- **`force_reply` for all text input.** Links the answer to the prompt and avoids race conditions.
- **No text reply alongside `force_reply`.** Send the prompt, then wait.
- **`react` (🎉)** to celebrate a successful rewrite — lighter than another text message.
- **`edit`** to update an in-progress scoring card rather than sending a new message.
- **`<tg-spoiler>`** for model answers / sample paragraphs the learner shouldn't see first.
- **Diff markers (~strikethrough~ / **bold**)** to highlight before/after fixes inline.

## Rules

1. **Never rewrite the entire essay.** Only Top 2 fixes + 1 Band-Up example + Micro Drill.
2. **Never give a model answer before the learner writes.**
3. **Brainstorming is mandatory for band < 5.5.** No direct writing allowed.
4. **Forced Rewrite is mandatory.** 不重写完不准下课. Max 2 rewrite attempts.
5. **Challenge words.** Inject recently learned L2+ vocabulary.
6. **Difficulty feedback keyboard at every session end.**
7. **Record every session into `learner.db`** (S10).
