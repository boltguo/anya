---
name: data
description: "CRUD layer for learner.db (samples/errors/plans) and vocab.db (words/SRS)"
version: "1.0.0"
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
- **Flashcard** needs due words, quiz recording
- **Training flow** step 2 needs injection words, step 9/10 needs recording

## Scripts

### `tracker_db.py` — Practice Samples, Errors, Plans

**Script path**: `./hermes/skills/anya/data/scripts/tracker_db.py`
**Database**: `~/.anya/data/store/learner.db`

#### Recording a Practice Sample

After a training session completes (TF9):

```bash
node tracker_db.js add-sample \
  --skill-type writing \
  --prompt "Describe the chart showing..." \
  --raw-content "The chart illustrates..." \
  --band-task 5.5 --band-coherence 6.0 --band-lexical 5.5 --band-grammar 5.0 \
  --band-overall 5.5 \
  --feedback "难理解" \
  --translation "图表展示了..." \
  --difficulty-switches 1
```

Returns `{ "ok": true, "sample_id": 42 }`.

#### Recording Errors

For each error, use a `recurrence_key` from the taxonomy:

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
node tracker_db.js get-sample 42
node tracker_db.js error-stats --limit 10
node tracker_db.js band-history --skill-type writing --limit 20
node tracker_db.js get-plan
node tracker_db.js stats
```

#### Plans

```bash
node tracker_db.js add-plan \
  --week-label "2026-W15" \
  --goals '["Practice Task 2 essays", "Focus on coherence"]' \
  --daily-breakdown '{"Mon": "writing", "Tue": "reading"}'
node tracker_db.js get-plan
node tracker_db.js list-plans
```

---

### `vocab_db.py` — Vocabulary Notebook & SRS

**Script path**: `./hermes/skills/anya/data/scripts/vocab_db.py`
**Database**: `~/.anya/data/store/vocab.db`

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

Training flow step 2:
```bash
node vocab_db.js inject --topic <topic> --limit 3
```

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

1. Check if it exists: `vocab_db.py lookup <word>`
2. **If exists** → render card with mastery info
3. **If not** → generate definition, IPA, Chinese, POS, collocations
4. Show translation + personalized examples
5. Present choice: **加入单词本** / **跳过**
6. If confirmed → `vocab_db.py add --word ... --source "lookup"`

Function words that should NOT trigger implicit lookup:
`the, a, an, is, am, are, was, were, be, been, being, have, has, had, do, does, did, will, would, shall, should, may, might, must, can, could, it, its, i, me, my, we, us, our, you, your, he, him, his, she, her, they, them, their, this, that, these, those, to, of, in, for, on, with, at, by, from, as, into, about, but, or, and, not, no, if, so, than`

## Rules

1. **Pure CRUD only.** Analysis belongs in `assessment`, not here.
2. **recurrence_key must come from the taxonomy.** See `assessment/references/error_taxonomy.md`.
3. **Every training session must produce exactly one sample record.** Even if abandoned.
4. **skill_type values**: `writing`, `speaking`, `reading`, `listening`, `daily`.
5. **All vocabulary data goes through `vocab_db.py`** — never store word data in MEMORY.md.
6. **Review sessions**: maximum 5 words per session.
7. **All output is JSON.** Parse to render mobile-friendly cards.
