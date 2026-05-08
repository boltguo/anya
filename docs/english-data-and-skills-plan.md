# English Data & Skills Plan

This document keeps the English learning design aligned across prompt files,
skills, and `study.db`.

## Four Markdown Files

These files constrain the agent on every turn. They are prompt-facing, compact,
and human-editable.

| File | Role | Normal writer |
| --- | --- | --- |
| `SOUL.md` | Anya's identity, voice, teaching soul, and internal coaching stance. | Human / template |
| `RULES.md` | Runtime rules: tools, Telegram behavior, skill execution, memory boundaries. | Human / template |
| `USER.md` | Short natural-language user profile: identity, goals, interests, preferences, behavior habits, interaction style. | `profile-manager` / memory tool |
| `MEMORY.md` | Long-running learner state: IELTS-style bands when useful, calibration, weak dimensions, subcap profiles, adaptive difficulty, durable coaching strategy. | `learner-state` / placement skills |

`USER.md` answers "who is this user and how do they like to learn?" It should
read like concise notes, not a large form.
`MEMORY.md` answers "what is the learner's current English level and what
should training adapt to?"

## Data Boundary

- `state.db`: runtime conversation/session history. Owned by the agent runtime.
- `study.db`: English learning evidence. Owned by English skills.
- Markdown files: compact prompt layer. They should not become a raw event log.

Skills access `study.db` through typed `persist` actions, not raw SQL. Practice
skills write attempts, errors, scores, subcap evidence, and vocabulary evidence
through `persist`. The `learner-state` skill reads `persist action="study_summary"`
and rewrites the level/ability parts of `MEMORY.md`.

## Core Tables

The current schema intentionally stays lean:

| Table | Purpose |
| --- | --- |
| `learner_profile` | Structured stable learner facts that may mirror important `USER.md` fields. |
| `daily_tasks` | Planned study slots and router-visible next actions. |
| `samples` | One row per practice, placement, or mock-section attempt. |
| `errors` | Concrete mistakes extracted from a sample. |
| `error_patterns` | Aggregated recurring weaknesses derived from `errors`. |
| `subcap_scores` | Fine-grained skill evidence such as `writing.argument_depth`. |
| `words` | Unified vocabulary, chunks, patterns, and personal-error cards. |
| `word_reviews` | SRS review attempts and outcomes. |
| `band_trend` | Daily derived band estimate by section/domain. |
| `activity_log` | Daily aggregate for minutes, sessions, sections, and review volume. |

Do not add a table just because aouo has one. Add a table only when Anya has a
repeated query/write pattern that is painful or ambiguous in the current schema.

## Coverage

The 10-table schema is complete enough for the current Anya loop:

- Four English practice domains: `samples`, `errors`, `subcap_scores`, and `band_trend`
  preserve raw attempts, concrete mistakes, sub-ability evidence, and section
  trends.
- Vocabulary: `words` stores words, chunks, patterns, and personal-error cards;
  `word_reviews` preserves SRS review evidence.
- Learning state: `learner_profile`, `activity_log`, `error_patterns`, and
  `band_trend` give `learner-state` enough data to refresh `MEMORY.md`.
- Planning: `daily_tasks` is enough for daily recommendations and router-visible
  next actions.

Do not add mock-session, media, quiz, paraphrase, or item-bank tables yet. Add
them only when a real workflow needs repeated first-class queries that cannot be
cleanly answered from `samples.metadata`, `words.metadata`, or existing rows.

## Skills Aggregation

Keep user-facing skills grouped by learning purpose, while support skills stay
hidden from slash commands.

| Group | Skills | Data responsibility |
| --- | --- | --- |
| Onboarding & routing | `profile-manager`, `placement-quick`, `planner` | Fill `USER.md`, seed `learner_profile`, produce initial `MEMORY.md`. |
| Learner state | `learner-state`, `coach` | Read `study.db`, refresh `MEMORY.md`, explain priorities. |
| Listening | dictation, shadowing, podcast, number drill | Write `samples`, `errors`, `subcap_scores`. |
| Speaking | freetalk, roleplay, repeat, pronunciation clinic | Write speaking evidence and audio-linked samples. |
| Reading/input | article, deepdive, skim drill, typetrain | Write reading evidence and vocabulary harvests. |
| Writing | essay, journal, rewrite, builder | Write writing samples, errors, and band/subcap evidence. |
| Vocabulary/SRS | topic vocab, review, test-me, harvest | Maintain `words` and `word_reviews`. |
| Support | `data-contract`, descriptors, prompt hash/error keys | Define schema/contracts; no direct user workflow. |

## Update Rules

- User facts and behavior habits go to `USER.md`; important structured fields may also mirror to `learner_profile`.
- Practice evidence goes to `study.db` through `persist`, not directly to `MEMORY.md`.
- Vocabulary and SRS updates go through `persist` actions: `word_upsert`, `due_words`, `word_lookup`, and `word_review`.
- Plans go through `persist` actions: `task_upsert`, `due_tasks`, and `task_complete`.
- Level records and weak dimensions go to `MEMORY.md` only through placement or `learner-state`.
- `SOUL.md` and `RULES.md` are stable operating files, not learning records.
