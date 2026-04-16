# Shared Training Flow Reference — 10-Step Universal Training Loop

All four training skills (writing, speaking, reading, listening) share this common 10-step structure.
Each skill's SKILL.md contains the complete step-by-step checklist; this file documents shared conventions.

> **Core principle**: "没有重做就没有教学" — No redo, no teaching. Steps 8-9 are mandatory.

## Session Data

All session data saved to `~/.anya/data/ielts/learn/{timestamp}_{type}.json`.
Synced to `learner.db` via `db` tool after completion.

## 10-Step Universal Training Loop

| Step | Name                  | Action                                                                                       | Required |
| ---- | --------------------- | -------------------------------------------------------------------------------------------- | -------- |
| S1   | **Context Load**      | Read MEMORY.md + USER.md + `db name=learner` for errors + samples                            | ✅       |
| S2   | **Decision Engine**   | Decide mode + difficulty + vocab injection (`db name=vocab`)                                 | ✅       |
| S3   | **Warm-up**           | Optional 30s warm-up (shadowing sentence, quick vocab recall, etc.)                          | ⚪       |
| S4   | **Scaffolded Input**  | Send prompt with appropriate scaffolding (骨架/提示/挑战词) based on band                    | ✅       |
| S5   | **Main Task**         | User completes the main task (write/speak/answer/listen)                                     | ✅       |
| S6   | **4D Scoring + Diff** | Score (4D for writing/speaking, accuracy for reading/listening) + highlight errors           | ✅       |
| S7   | **Focused Feedback**  | 1-2 core bottlenecks only (not 10 errors). Band-Up example for writing/speaking              | ✅       |
| S8   | **Micro Drill**       | Targeted mini-exercise on the #1 bottleneck (quiz/造句/听写/替换)                            | ✅       |
| S9   | **Forced Redo**       | User must redo the weak part (rewrite paragraph / re-speak sentence / re-listen)             | ✅       |
| S10  | **Memory Sync**       | Record to learner.db + vocab.db via `db` tool + difficulty feedback keyboard                  | ✅       |

### Step Details

#### S1 Context Load

- Read MEMORY.md for band overview, weak dimensions, pronunciation risks
- Read USER.md for interests (engage topics), goals, preferences
- Query `db name=learner sql="SELECT recurrence_key, category, COUNT(*) as count FROM errors GROUP BY recurrence_key ORDER BY count DESC LIMIT 10"` for recent error patterns
- Query `db name=learner sql="SELECT * FROM samples ORDER BY created_at DESC LIMIT 5"` for recent session history
- Avoid repeating the same task type as the last 2 sessions

#### S2 Decision Engine

- Select training mode based on learner data (each skill has its own mode selection logic)
- Set difficulty = current band + 0.5 (adjustable by difficulty_feedback history)
- Inject vocabulary: `db name=vocab sql="SELECT word, definition FROM words WHERE topics LIKE ? AND mastery != 'mastered' ORDER BY srs_due LIMIT 3" params='["%<topic>%"]'`
- For speaking/listening: also inject recently learned L2+ words as challenge words

#### S3 Warm-up (Optional)

- Speaking: 1 shadowing sentence or quick pronunciation drill
- Listening: 1 sound discrimination pair
- Reading: 1 vocabulary recall from last session
- Writing: 1 sentence-level grammar fix
- Skip if learner is returning within 30 minutes

#### S8 Micro Drill — Skill-Specific Examples

| Skill     | Micro Drill Type                          | Example                               |
| --------- | ----------------------------------------- | ------------------------------------- |
| Writing   | Word replacement + sentence construction  | "用 detrimental 替换 bad，造一个句子" |
| Speaking  | High-band sentence pattern + TTS + redo   | "用 'While it is true that...' 重说"  |
| Reading   | Sentence anatomy on error sentence        | "which 从句修饰的是谁？"              |
| Listening | Key sentence dictation or paraphrase quiz | 听写错题中的关键句                    |

#### S9 Forced Redo — Rules

1. User MUST complete the redo before the session can end
2. Writing: rewrite the entire paragraph with improvements
3. Speaking: re-speak the weak sentence/answer with corrections
4. Reading: re-answer the wrong question after sentence anatomy
5. Listening: re-listen and re-transcribe the missed segment
6. Compare redo vs original — acknowledge improvement
7. If redo still fails: give one more hint, allow one more attempt, then move on with encouragement

#### S10 Memory Sync — Recording Template

```
# Record sample
db name=learner sql="INSERT INTO samples (created_at, skill_type, prompt, band_task, band_coherence, band_lexical, band_grammar, band_overall, session_id, feedback) VALUES (datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?)" params='["<skill>", "<prompt>", null, null, null, null, null, "<session_id>", null]'

# Record errors
db name=learner sql="INSERT INTO errors (sample_id, recurrence_key, category, severity, original_phrase, correction) VALUES (?, ?, ?, ?, ?, ?)" params='[<id>, "<key>", "<cat>", "<sev>", "...", "..."]'

# Track vocabulary usage
db name=vocab sql="INSERT INTO word_events (word, event_type, session_type, context, created_at) VALUES (?, ?, ?, ?, datetime('now'))" params='["<word>", "<exposure|production>", "<skill>", "..."]'
```

#### S10 Difficulty Feedback Keyboard (Mandatory)

Every training session MUST end with this inline keyboard:

```
[KEYBOARD:
😰 太难了=feedback_too_hard | 👌 刚好=feedback_just_right | 🥱 太简单=feedback_too_easy
🔁 继续练习=skill | 🏠 返回菜单=menu
]
```

Callback handling:

- `feedback_too_hard` → next session: lower difficulty, increase scaffolding
- `feedback_just_right` → maintain current difficulty
- `feedback_too_easy` → next session: raise difficulty, reduce scaffolding

## Scoring Dimensions

| Writing                  | Speaking                 |
| ------------------------ | ------------------------ |
| Task Response            | Fluency & Coherence      |
| Coherence & Cohesion     | Pronunciation            |
| Lexical Resource         | Lexical Resource         |
| Grammar Range & Accuracy | Grammar Range & Accuracy |

Reading and Listening use accuracy-based scoring (% correct → estimated band).

## Translation Tiering Strategy

| Band    | Transcript         | Translation                     | Implementation                              |
| ------- | ------------------ | ------------------------------- | ------------------------------------------- |
| 4.0-5.0 | Full text          | Full Chinese translation        | `<tg-spoiler>全文+翻译</tg-spoiler>`        |
| 5.5-6.0 | Full text          | Key sentences + vocabulary only | Key sentences in `<tg-spoiler>`             |
| 6.5+    | Evidence line only | No default translation          | `[显示翻译\|show_translation]` on-demand |

## Callback Routing

All next-step buttons use callback prefix:

| Callback                                                                   | Action                        |
| -------------------------------------------------------------------------- | ----------------------------- |
| `writing`                                                               | Start new writing exercise    |
| `speaking`                                                              | Start new speaking exercise   |
| `reading`                                                               | Start new reading exercise    |
| `listening`                                                             | Start new listening exercise  |
| `speaking:shadowing`                                                    | Speaking shadowing mode       |
| `speaking:qa`                                                           | Speaking guided QA mode       |
| `speaking:exam`                                                         | Speaking examiner sim mode    |
| `speaking:retell`                                                       | Speaking retell mode          |
| `speaking:roleplay`                                                     | Speaking role-play mode       |
| `speaking:cuecard`                                                      | Speaking cue card build mode  |
| `listening_sound`                                                       | Listening sound drill mode    |
| `listening:dictation`                                                   | Listening dictation mode      |
| `listening:clip`                                                        | Listening short clip mode     |
| `listening:type`                                                        | Listening question type drill |
| `reading_skim`                                                          | Reading flash-skimming mode   |
| `reading_anatomy`                                                       | Reading sentence anatomy mode |
| `writing:brain`                                                         | Writing brainstorming mode    |
| `writing:teel`                                                          | Writing TEEL drill mode       |
| `reading_harder` / `reading_easier`                                  | Adjust reading difficulty     |
| `listening_harder` / `listening_easier`                              | Adjust listening difficulty   |
| `listening_replay`                                                      | Replay audio                  |
| `feedback_too_hard` / `feedback_just_right` / `feedback_too_easy` | Difficulty feedback           |
| `show_translation`                                                      | Show translation on demand    |
| `word_save`                                                             | Save word to vocab.db         |
| `word_review`                                                           | Trigger SRS review            |
| `word_history`                                                          | Show word usage history       |
| `report_detail`                                                         | Detailed assessment report    |
| `report_plan`                                                           | Show/generate weekly plan     |
| `menu`                                                                  | Return to practice menu       |

## Error Recording

All errors use taxonomy keys from `assessment/references/error_taxonomy.md`:

```
db name=learner sql="INSERT INTO errors (sample_id, recurrence_key, category, severity, original_phrase, correction) VALUES (?, ?, ?, ?, ?, ?)" params='[<id>, "<key>", "<cat>", "<sev>", "...", "..."]'
```

## Vocabulary Usage Tracking

When injected words are used (or encountered) in a session:

```
db name=vocab sql="INSERT INTO word_events (word, event_type, session_type, context, created_at) VALUES (?, ?, ?, ?, datetime('now'))" params='["<word>", "<exposure|production>", "<skill>", "..."]'
```
