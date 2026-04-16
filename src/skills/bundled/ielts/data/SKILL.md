---
name: data
description: 'CRUD layer for learner.db (samples/errors/plans) and vocab.db (words/SRS)'
version: '2.0.0'
metadatahermes:
  tags: [ielts, data, sqlite, tracker, vocabulary, srs]
  category: anya
---

# Learning Data Store

Unified CRUD layer for all persistent learning data. Contains two scripts operating on two SQLite databases under `~/.anya/data/ielts/`.

## When to Use

- **Any training skill** needs to record a practice sample, errors, or link words
- **Word lookup** — learner sends a single word, needs add/query/review
- **Assessment** queries samples, errors, band history
- **Planner** reads/writes weekly plans
- **Flashcard** needs due words, quiz recording, transfer level tracking
- **Training flow** S2 needs injection words, S10 needs recording + difficulty feedback

## Scripts

### `tracker_db.js` — Practice Samples, Errors, Plans

**Script path**: `./data/scripts/tracker_db.js`
**Database**: `~/.anya/data/ielts/learner.db`

#### Recording a Practice Sample (Extended)

After a training session completes (S10):

```bash
node tracker_db.js add-sample \
  --skill-type writing \
  --prompt "Describe the chart showing..." \
  --raw-content "The chart illustrates..." \
  --band-task 5.5 --band-coherence 6.0 --band-lexical 5.5 --band-grammar 5.0 \
  --band-overall 5.5 \
  --feedback "难理解" \
  --translation "图表展示了..." \
  --mode full_task \
  --question-type task2_opinion \
  --duration-sec 1200 \
  --redo-count 1 \
  --support-level medium \
  --difficulty-feedback just_right \
  --response-length-words 267
```

Returns `{ "ok": true, "sample_id": 42 }`.

**Extended `samples` table fields:**

| Field                   | Type    | Description                  | Values                                                                                                                                                                                                                                         |
| ----------------------- | ------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mode`                  | TEXT    | Training mode                | `shadowing` / `dictation` / `guided_qa` / `examiner_sim` / `cue_card_build` / `roleplay` / `retell` / `teel_drill` / `full_task` / `sound_drill` / `short_clip` / `question_type` / `lecture` / `flash_skim` / `sentence_anatomy` / `standard` |
| `question_type`         | TEXT    | Question/task type           | `TFNG` / `form_completion` / `cue_card` / `task1_process` / `task1_bar` / `task1_line` / `task1_pie` / `task2_opinion` / `task2_discussion` / `multiple_choice` / `matching` / `short_answer` / `sentence_completion` / `map_labeling`         |
| `duration_sec`          | INTEGER | Actual time spent (seconds)  | —                                                                                                                                                                                                                                              |
| `redo_count`            | INTEGER | Number of redo attempts      | Default 0                                                                                                                                                                                                                                      |
| `support_level`         | TEXT    | Scaffolding level provided   | `high` / `medium` / `low` / `none`                                                                                                                                                                                                             |
| `difficulty_feedback`   | TEXT    | User's difficulty perception | `too_hard` / `just_right` / `too_easy`                                                                                                                                                                                                         |
| `audio_duration_sec`    | INTEGER | Listening audio length       | —                                                                                                                                                                                                                                              |
| `response_length_words` | INTEGER | User's response word count   | —                                                                                                                                                                                                                                              |
| `accent`                | TEXT    | Audio accent type            | `standard` / `british` / `australian` / `indian` / `mixed`                                                                                                                                                                                     |
| `speaker_count`         | INTEGER | Number of speakers in audio  | —                                                                                                                                                                                                                                              |

#### Recording Errors

For each error, use a `recurrence_key` from the taxonomy (`assessment/references/error_taxonomy.md`):

```bash
node tracker_db.js add-error \
  --sample-id 42 \
  --recurrence-key sv_agreement \
  --category grammar \
  --severity high \
  --original-phrase "The data shows that people is..." \
  --correction "The data show that people are..." \
  --rule-note "Collective nouns + plural verb agreement"
```

#### Linking Words to Samples

```bash
node tracker_db.js add-words-batch \
  --sample-id 42 \
  --words "ubiquitous,resilient,paradigm" \
  --usage-type production
```

#### Querying

```bash
node tracker_db.js list-samples --skill-type writing --limit 10
node tracker_db.js list-samples --since 7d --limit 50
node tracker_db.js list-samples --mode examiner_sim --limit 5
node tracker_db.js get-sample 42
node tracker_db.js list-errors --limit 10
node tracker_db.js list-errors --category grammar --limit 10
node tracker_db.js list-errors --skill speaking --limit 10
node tracker_db.js error-stats --limit 10
node tracker_db.js band-history --skill-type writing --limit 20
node tracker_db.js get-plan
node tracker_db.js stats
```

#### Plans

```bash
node tracker_db.js add-plan \
  --week-label "2026-W16" \
  --primary-focus "writing" \
  --secondary-focus "grammar:sv_agreement" \
  --target-skill "Task 2 opinion essays" \
  --suggested-exercises '["Write opinion essay on education", "Rewrite 2 previous essays", "Grammar drill: subject-verb agreement"]' \
  --carry-over-errors "sv_agreement,cohesion_missing" \
  --difficulty-notes "User reported too_hard on last 2 writing sessions"
node tracker_db.js get-plan
node tracker_db.js list-plans
```

---

### `vocab_db.js` — Vocabulary Notebook & SRS

**Script path**: `./data/scripts/vocab_db.js`
**Database**: `~/.anya/data/ielts/vocab.db`

#### Word Lookup & Add

```bash
node vocab_db.js lookup <word>
node vocab_db.js add \
  --word <word> \
  --definition "<english definition>" \
  --chinese "<中文释义>" \
  --ipa "<ipa>" \
  --pos "<part of speech>" \
  --collocations "<collocation 1; collocation 2>" \
  --topics "<topic1,topic2>" \
  --source "lookup" \
  --example "<personalized example sentence>"
```

#### Review & Quiz

```bash
node vocab_db.js list due --limit 5
node vocab_db.js quiz <word> --type <quiz-type> --result <correct|wrong|partial>
node vocab_db.js use <word> --event <exposure|production> --session-type <skill> --context "..."
```

#### Injection for Training Skills

Training flow S2:

```bash
node vocab_db.js inject --topic <topic> --limit 3
```

Inject recently learned L2+ words as challenge words:

```bash
node vocab_db.js inject --transfer-level 2 --limit 2
```

#### Transfer Level Tracking

```bash
node vocab_db.js set-transfer <word> --level <1|2|3|4>
node vocab_db.js list --transfer-level <1|2|3|4> --limit 10
```

Transfer levels:

- **L1 Notice**: Flashcard recognition (known/vague/unknown)
- **L2 Collocation**: Can identify correct collocations in quiz
- **L3 Speaking**: Successfully used in speaking practice
- **L4 Writing**: Successfully used in writing practice

Auto-upgrade: When a word is used in speaking (`--event production --session-type speaking`), upgrade to L3. When used in writing, upgrade to L4.

#### Other Commands

```bash
node vocab_db.js get <word>     # Full record with history
node vocab_db.js stats          # Dashboard
node vocab_db.js master <word>  # Mark as mastered
node vocab_db.js delete <word>  # Remove
node vocab_db.js dump           # Export all
```

## Implicit Word Lookup

When a learner sends a single English word (2-25 chars, not a function word):

1. Check if it exists: `vocab_db.js lookup <word>`
2. **If exists** → render card with mastery info + SRS status
   - Show: word, IPA, definition, Chinese, collocations, transfer level, next review date
   - Keyboard: `[复习|word_review]` `[使用记录|word_history]`
3. **If not** → generate definition, IPA, Chinese, POS, collocations
   - Show translation + personalized examples + TTS
   - Keyboard: `[加入单词本|word_save]` `[跳过|word_next]`
4. If confirmed → `vocab_db.js add --word ... --source "lookup"`

Function words that should NOT trigger implicit lookup:
`the, a, an, is, am, are, was, were, be, been, being, have, has, had, do, does, did, will, would, shall, should, may, might, must, can, could, it, its, i, me, my, we, us, our, you, your, he, him, his, she, her, they, them, their, this, that, these, those, to, of, in, for, on, with, at, by, from, as, into, about, but, or, and, not, no, if, so, than`

## Callback Handling

| Callback          | Action                                                            |
| ----------------- | ----------------------------------------------------------------- |
| `word_save`    | `vocab_db.js add` → sync word to DB, react ✅                     |
| `word_review`  | `vocab_db.js list due --limit 1` → start SRS review for this word |
| `word_history` | `vocab_db.js get <word>` → show usage history across sessions     |

## Rules

1. **Pure CRUD only.** Analysis belongs in `assessment`, not here.
2. **recurrence_key must come from the taxonomy.** See `assessment/references/error_taxonomy.md`.
3. **Every training session must produce exactly one sample record.** Even if abandoned.
4. **skill_type values**: `writing`, `speaking`, `reading`, `listening`, `daily`.
5. **All vocabulary data goes through `vocab_db.js`** — never store word data in MEMORY.md.
6. **Review sessions**: maximum 5 words per session.
7. **All output is JSON.** Parse to render mobile-friendly cards.
8. **Extended fields are optional.** Omit fields you don't have data for; they default to NULL.
9. **redo_count = 0 samples have lower weight** in assessment calculations.
