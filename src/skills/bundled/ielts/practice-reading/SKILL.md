---
name: practice-reading
description: 'IELTS reading: flash-skimming, sentence anatomy, band-scaled passages + micro drill'
---

# Reading Trainer — Speed + Sentence Anatomy System

## When to Use

- Learner says "阅读", "reading", "练阅读", "学阅读", "看文章"
- Callback: `reading` or any `reading:*` mode callback
- Reply Keyboard tap: "📖 阅读"

## Data

All session, error, and band data live in `learner.db` (tables `samples` + `errors`).
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

| Mode                  | Use Case                                      | Core Interaction                      | Callback              | Reference                                  |
| --------------------- | --------------------------------------------- | ------------------------------------- | --------------------- | ------------------------------------------ |
| **Flash-Skimming**    | Reading too slow / word-by-word translation   | Timed display → hide → quiz           | `reading_skim`        | `references/modes/flash-skim.md`           |
| **Sentence Anatomy**  | Long sentence breakdown / T/F/NG logic errors | Socratic questioning → force_reply    | `reading_anatomy`     | `references/modes/sentence-anatomy.md`     |
| **Standard Practice** | Regular training                              | Band-scaled passage + mixed questions | `reading`             | `references/modes/standard.md`             |
| **Timed Exam**        | Exam prep (band 6.5+)                         | 900 words + 15-min strict cutoff      | (advanced)            | `references/modes/standard.md` (15-min variant) |

Load before executing:

```
skill_view name=practice-reading file=references/modes/<mode>.md
```

## Universal Workflow

### S1 — Context Load + Mode Selection

1. `memory target=user action=read` → interests
2. `memory target=memory action=read` → current reading band, reading pace
3. Recent reading samples + top errors (queries above)

**Auto Mode Selection** (if no specific `reading:*` callback):

- `speed_too_slow` in recent errors → **Flash-Skimming**
- `sentence_anatomy_fail` or `tfng_logic_error` frequent → **Sentence Anatomy** (also auto-triggered after wrong answers in Standard)
- Default → **Standard Practice**

### S2 — Vocabulary Injection

Use the topic-filtered vocab query above (top of Data section).

### S3-S10 — Per Mode

Read the corresponding `references/modes/<mode>.md`, then execute its S3-S10. Each mode reference is self-contained.

**Sentence Anatomy auto-triggers** on wrong answers in Standard Practice (especially T/F/NG and heading matching).

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

## Rules

1. **Track time.** If consistently slow, suggest Flash-Skimming.
2. **Injected words must appear naturally** in passages — never force awkward usage.
3. **Micro Drill + Forced Redo are mandatory.** S8 + S9 must happen.
4. **Band-scale passage length.** Don't give 900 words to a band 4.5 learner.
5. **Record every session into `learner.db`** (S10).
