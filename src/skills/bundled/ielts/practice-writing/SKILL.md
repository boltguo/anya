---
name: practice-writing
description: 'IELTS writing: brainstorming + TEEL scaffold + sentence-lab + forced rewrite loop + 3-layer feedback + subcap profiling'
---

# Writing Coach — Scaffolded Rewrite System

## Pedagogical Foundation

- **Ericsson Deliberate Practice**: Same-topic rewrite chains are the core training method
- **Swain Output Hypothesis**: Forced independent output, never choose-from-options substitutes
- **Schmidt Noticing Hypothesis**: Feedback triggers forced noticing (gap-fill, minimal pair, contrastive rewrite)
- **Lewis Lexical Approach**: Sentence-lab mode prioritizes chunk/pattern acquisition

## When to Use

- Learner says "写作", "writing", "练写作", "学写作", "作文", "写essay"
- Callback: `writing` or any `writing:*` mode callback
- Reply Keyboard tap: "✍️ 写作"

## Data

All session, error, and band data live in `learner.db` (tables `samples` + `errors` + `subcap_scores`).
Write through the `db` tool only — no JSON sidecar files.

Useful queries:

```
# Recent writing sessions
db name=learner sql="SELECT id, created_at, band_overall FROM samples WHERE skill_type='writing' ORDER BY created_at DESC LIMIT 5"

# Rewrite chain for a prompt
db name=learner sql="SELECT id, created_at, band_overall, redo_count FROM samples WHERE prompt_hash = ? ORDER BY created_at ASC" params='["<hash>"]'

# Top recurring writing errors
db name=learner sql="SELECT recurrence_key, category, COUNT(*) as count FROM errors e JOIN samples s ON e.sample_id=s.id WHERE s.skill_type='writing' GROUP BY recurrence_key ORDER BY count DESC LIMIT 10"

# Inject 3 transferable challenge words for a topic
db name=vocab sql="SELECT word, definition FROM words WHERE topics LIKE ? AND mastery IN ('learning','known') AND transfer_level >= 2 ORDER BY is_user_word DESC, priority DESC, srs_due ASC LIMIT 3" params='["%<topic>%"]'
```

If a column is unfamiliar, call `db name=learner` (no sql) for a full schema dump.

## Mode Matrix → Reference Files

| Phase          | Mode                       | When                             | Callback            | load_score | Reference                                |
| -------------- | -------------------------- | -------------------------------- | -------------------- | ---------- | ---------------------------------------- |
| **Cold start** | Brainstorming              | band < 5.5, brain blank          | `writing:brain`      | 2          | `references/modes/brainstorming.md`      |
| **Paragraph**  | TEEL Drill                 | Logic scattered, can't structure | `writing:teel`       | 3          | `references/modes/teel.md`               |
| **Sentence**   | Sentence Lab               | Chinglish / low lexical variety  | `writing:sentlab`    | 2          | `references/modes/sentence-lab.md`       |
| **Full task**  | Full Task + Forced Rewrite | Regular training                 | `writing`            | 4          | `references/modes/full-task.md`          |
| **Task 1**     | Chart Description          | Task 1 practice                  | (via S2 decision)    | 4          | `references/modes/full-task.md` (Task 1) |

Load before executing:

```
skill_view name=practice-writing file=references/modes/<mode>.md
```

## Universal Workflow

### S1 — Context Load

1. `memory target=user action=read` → interests
2. `memory target=memory action=read` → current writing band, weak dimensions, Path type, Daily Load remaining
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
- `chinglish_transfer` or `lexical_repetition_high` or `word_choice_basic` in recent errors → suggest **Sentence Lab**
- Callback `writing:teel` → TEEL Drill mode
- Callback `writing:sentlab` → Sentence Lab mode
- If Daily Load remaining < mode's load_score → suggest Sentence Lab (load_score=2) instead of Full Task (load_score=4)

### S3-S5 — Per Mode

Read the corresponding `references/modes/<mode>.md`, then execute its S3-S5. Then continue to the shared S6-S10 below.

## Shared Steps (All Modes)

### S6 — 3-Layer Feedback + 4D Scoring

**Layer 1 — Task Layer** (Does it answer the question?):
- Task Response score
- Position clarity
- Length adequacy
- Topic coverage

**Layer 2 — Logic Layer** (Is the argument sound?):
- Coherence & Cohesion score
- Paragraph transitions
- Argument depth (assertion vs. developed)
- Counter-argument handling (Task 2 discussion only)
- TEEL structure compliance

**Layer 3 — Language Layer** (Is the English natural and accurate?):
- Lexical Resource score
- Grammar Range & Accuracy score
- **Chinglish transfer check**: topic-comment structure, zero article patterns, modal flattening
- **Connector overload check**: count linking devices, flag if > 3 per paragraph
- **Lexical repetition check**: flag any content word used 3+ times without paraphrase
- AWL coverage rate (for band 6.5+)

| Layer | Criterion                | Score   |
| ----- | ------------------------ | ------- |
| Task  | Task Response            | X.0     |
| Logic | Coherence & Cohesion     | X.0     |
| Lang  | Lexical Resource         | X.0     |
| Lang  | Grammar Range & Accuracy | X.0     |
| All   | **Overall**              | **X.0** |

Highlight specific issues with diff markers:

```
❌ "This is ~bad~ for environment"
✅ "This is **detrimental** to **the** environment"
```

### S7 — Focused Feedback (1-2 core bottlenecks only)

Do NOT list 10 errors. Pick the **1-2 most impactful** issues:

- Example: "缺连接词" + "bad 太低级"
- Show Band-Up: current sentence → +1.0 band version
- **Forced Noticing**: present a gap-fill or minimal pair for the learner to complete

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

### S10 — Record + Subcap Scores + Difficulty Feedback

Record the session with rewrite chain metadata:

```
db name=learner sql="INSERT INTO samples (created_at, skill_type, prompt, raw_content, band_task, band_coherence, band_lexical, band_grammar, band_overall, session_id, parent_sample_id, redo_count, prompt_hash, load_score, session_window) VALUES (datetime('now'), 'writing', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)" params='["<prompt>", "<content>", null, null, null, null, null, "<session_id>", <parent_id_or_null>, <redo_count>, "<prompt_hash>", <load_score>, "<window>"]'
```

Write subcap_scores for each assessed sub-capability:

```
db name=learner sql="INSERT INTO subcap_scores (sample_id, subcap_key, score, evidence, created_at) VALUES (?, ?, ?, ?, datetime('now'))" params='[<sample_id>, "writing.argument_depth", 5.0, "Assertions lack specific examples"]'
```

Subcap keys to evaluate per writing session:
- `writing.task_response`
- `writing.argument_depth`
- `writing.cohesion_logic`
- `writing.connector_density`
- `writing.lexical_sophistication`
- `writing.chinglish_transfer`
- `writing.grammar_accuracy`

Record errors:

```
db name=learner sql="INSERT INTO errors (sample_id, recurrence_key, category, severity, original_phrase, correction) VALUES (?, ?, ?, ?, ?, ?)" params='[<sample_id>, "<key>", "<cat>", "<sev>", "...", "..."]'
```

Auto-harvest high-value expressions into vocab.db:

```
db name=vocab sql="INSERT OR IGNORE INTO words (word, definition, chinese, pos, source, origin, example_en, mastery, item_kind, source_sample_id, created_at, updated_at) VALUES (?, ?, ?, ?, 'practice', 'auto_harvest', ?, 'learning', 'chunk', ?, datetime('now'), datetime('now'))" params='["take ... into account", "to consider", "考虑到", "chunk", "We must take all factors into account.", <sample_id>]'
```

Mark daily_task as completed if applicable:

```
db name=learner sql="UPDATE daily_tasks SET completed = 1, completed_at = datetime('now'), sample_id = ? WHERE id = (SELECT id FROM daily_tasks WHERE date = date('now') AND skill = 'writing' AND completed = 0 LIMIT 1)" params='[<sample_id>]'
```

Persist difficulty feedback when the learner taps the difficulty button (`feedback_too_hard` / `feedback_just_right` / `feedback_too_easy`):

```
db name=learner sql="UPDATE samples SET feedback = json_set(COALESCE(feedback,'{}'), '$.difficulty', ?) WHERE id = ?" params='["just_right", <sample_id>]'
```

Difficulty feedback:

```
[KEYBOARD:
😰 太难了=feedback_too_hard | 👌 刚好=feedback_just_right | 🥱 太简单=feedback_too_easy
🔁 再来一题=writing | 🏠 返回菜单=practice
]
```

## Metacognitive Hook (Before S6)

Before scoring, ask the learner to self-predict:

```
tg(type:"force_reply", text:"你觉得这篇大概几分？（直接输入数字，如 5.5）")
```

Record the gap between prediction and actual score. Store `abs(prediction - actual)` in MEMORY `Metacognition.self_prediction_gap` (running average). This is for metacognitive tracking only — never mark the learner's prediction as "wrong".

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
7. **Record every session into `learner.db`** (S10) with subcap_scores and prompt_hash.
8. **3-layer feedback is mandatory.** Every scoring must separate Task / Logic / Language layers.
9. **Chinglish and connector overload checks** are mandatory for band 5.5+.
10. **Auto-harvest** good expressions from rewrites into vocab.db as chunks.
