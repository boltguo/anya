---
name: practice-reading
description: 'IELTS reading: flash-skimming, sentence anatomy, argument-map, attitude-scan, ext-reading, band-scaled passages + subcap profiling'
---

# Reading Trainer — Speed + Structure + Comprehension System

## Pedagogical Foundation

- **Krashen i+1**: Passage difficulty matched to band; ext-reading at 95%+ vocabulary coverage
- **Ericsson Deliberate Practice**: Sentence anatomy drills target specific parsing failures
- **Nation Extensive Input**: ext-reading mode for building reading stamina and automatic recognition
- **Schmidt Noticing**: Wrong answers trigger Sentence Anatomy auto-drill, forcing noticing of parsing gap

## When to Use

- Learner says "阅读", "reading", "练阅读", "学阅读", "看文章"
- Callback: `reading` or any `reading:*` mode callback
- Reply Keyboard tap: "📖 阅读"

## Data

All session, error, and band data live in `learner.db` (tables `samples` + `errors` + `subcap_scores`).
Write through the `db` tool only — no JSON sidecar files.

Useful queries:

```
# Recent reading sessions
db name=learner sql="SELECT id, created_at, band_overall FROM samples WHERE skill_type='reading' ORDER BY created_at DESC LIMIT 5"

# Top recurring reading errors
db name=learner sql="SELECT recurrence_key, category, COUNT(*) as count FROM errors e JOIN samples s ON e.sample_id=s.id WHERE s.skill_type='reading' GROUP BY recurrence_key ORDER BY count DESC LIMIT 10"

# Inject 3 transferable challenge words for a topic
db name=vocab sql="SELECT word, definition FROM words WHERE topics LIKE ? AND mastery IN ('learning','known') AND transfer_level >= 2 ORDER BY is_user_word DESC, priority DESC, srs_due ASC LIMIT 3" params='["%<topic>%"]'
```

If a column is unfamiliar, call `db name=learner` (no sql) for a full schema dump.

## Mode Matrix → Reference Files

| Mode                  | Use Case                                      | Core Interaction                      | Callback              | load_score | Reference                                  |
| --------------------- | --------------------------------------------- | ------------------------------------- | --------------------- | ---------- | ------------------------------------------ |
| **Flash-Skimming**    | Reading too slow / word-by-word translation   | Timed display → hide → quiz           | `reading_skim`        | 2          | `references/modes/flash-skim.md`           |
| **Sentence Anatomy**  | Long sentence breakdown / T/F/NG logic errors | Socratic questioning → force_reply    | `reading_anatomy`     | 2          | `references/modes/sentence-anatomy.md`     |
| **Standard Practice** | Regular training                              | Band-scaled passage + mixed questions | `reading`             | 3          | `references/modes/standard.md`             |
| **Argument Map**      | Understanding essay structure                 | Identify claim/support/counter        | `reading:argmap`      | 3          | `references/modes/argument-map.md`         |
| **Attitude Scan**     | Author stance detection                       | Find attitude words + judge stance    | `reading:attitude`    | 2          | `references/modes/attitude-scan.md`        |
| **Ext-Reading**       | Reading stamina / fluency                     | 10-min non-exam text, gist only      | `reading:ext`         | 1          | `references/modes/ext-reading.md`          |
| **Timed Exam**        | Exam prep (band 6.5+)                         | 900 words + 15-min strict cutoff      | (advanced)            | 4          | `references/modes/standard.md` (15-min)    |

Load before executing:

```
skill_view name=practice-reading file=references/modes/<mode>.md
```

## Universal Workflow

### S1 — Context Load + Mode Selection

1. `memory target=user action=read` → interests
2. `memory target=memory action=read` → current reading band, reading pace, Path type, Daily Load remaining
3. Recent reading samples + top errors (queries above)

**Auto Mode Selection** (if no specific `reading:*` callback):

- `speed_too_slow` in recent errors → **Flash-Skimming**
- `sentence_anatomy_fail` or `tfng_logic_error` frequent → **Sentence Anatomy** (also auto-triggered after wrong answers in Standard)
- `author_attitude_miss` in recent errors → **Attitude Scan**
- `argument_structure_miss` in recent errors → **Argument Map**
- If Daily Load remaining < mode's load_score → suggest **Ext-Reading** (load_score=1)
- Default → **Standard Practice**

### S2 — Vocabulary Injection

Use the topic-filtered vocab query above (top of Data section).

### S3-S10 — Per Mode

Read the corresponding `references/modes/<mode>.md`, then execute its S3-S10. Each mode reference is self-contained.

**Sentence Anatomy auto-triggers** on wrong answers in Standard Practice (especially T/F/NG and heading matching).

## Performance Metadata

Record additional performance data in the `feedback` field of `samples` as JSON:

```json
{
  "reading_time_sec": 480,
  "word_count": 650,
  "wpm": 81,
  "re_reads": 2,
  "location_accuracy": 0.75,
  "question_types": {"tfng": 2, "heading": 1, "fill": 2},
  "question_accuracy": {"tfng": 0.5, "heading": 1.0, "fill": 0.5}
}
```

Use this to track:
- **Reading speed**: wpm trend over time
- **Re-read count**: proxy for processing difficulty
- **Location accuracy**: how often the learner finds the right paragraph
- **Question-type accuracy**: identifies persistent weak question types

## Subcap Scoring (S10)

After every scored session, write subcap_scores:

```
db name=learner sql="INSERT INTO subcap_scores (sample_id, subcap_key, score, evidence, created_at) VALUES (?, ?, ?, ?, datetime('now'))"
```

Keys to evaluate:
- `reading.sentence_anatomy` — from Sentence Anatomy drill performance or complex-sentence Qs
- `reading.gist` — from heading-match and main-idea questions
- `reading.paraphrase_mapping` — from synonym/paraphrase-dependent questions
- `reading.author_attitude` — from Attitude Scan mode or attitude questions
- `reading.argument_structure` — from Argument Map mode or structure questions
- `reading.pace` — from timed reading performance (wpm + accuracy combo)

## Telegram Interaction Style

- **Passages must be original.** Don't copy real IELTS tests.
- **Vary question types** across sessions.
- **`force_reply`** for answer submission (links answer to prompt).
- **`quiz`** for sound discrimination, T/F/NG logic probes.
- **`<tg-spoiler>`** for evidence lines and translations the learner shouldn't see first.
- **`tg(type:"edit", message_id:"passage")`** to hide a flash-skim passage in place.
- **`react` for lightweight ack** on a correct answer.
- **Concise scoring.** Don't send a full 4D table unless the learner asks.
- **Translation tiered by band.** Never give full translation to 6.5+ by default.

## Difficulty Feedback Keyboard (Mandatory)

```
[KEYBOARD:
😰 太难了=feedback_too_hard | 👌 刚好=feedback_just_right | 🥱 太简单=feedback_too_easy
]
```

Plus a mode-specific exit row (see each mode's reference).

## Session Completion (S10 — All Modes)

After recording the sample, mark daily_task completed and persist difficulty feedback:

```
db name=learner sql="UPDATE daily_tasks SET completed = 1, completed_at = datetime('now'), sample_id = ? WHERE id = (SELECT id FROM daily_tasks WHERE date = date('now') AND skill = 'reading' AND completed = 0 LIMIT 1)" params='[<sample_id>]'
```

Persist difficulty feedback when learner taps button:

```
db name=learner sql="UPDATE samples SET feedback = json_set(COALESCE(feedback,'{}'), '$.difficulty', ?) WHERE id = ?" params='["just_right", <sample_id>]'
```

## Rules

1. **Track time.** If consistently slow, suggest Flash-Skimming.
2. **Injected words must appear naturally** in passages — never force awkward usage.
3. **Micro Drill + Forced Redo are mandatory.** S8 + S9 must happen (except ext-reading).
4. **Band-scale passage length.** Don't give 900 words to a band 4.5 learner.
5. **Record every session into `learner.db`** (S10) with subcap_scores and performance metadata.
6. **Argument Map and Attitude Scan** are prioritized when corresponding errors appear.
7. **Ext-reading is stamina building only.** No scoring, no pressure.
8. **Load score respected.** Low budget → suggest ext-reading.
