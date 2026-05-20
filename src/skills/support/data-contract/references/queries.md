# Typed Persist Recipes (v3)

Skills must not issue raw SQL. Use `persist` actions.

## Practice Evidence (the most common write)

```json
{
  "action": "practice",
  "skill_type": "listening.dictation",
  "session_id": "tg:12345",
  "prompt": "The software engineer is coding a new game.",
  "response": "The soft engineer was coding new game",
  "accuracy": 0.5,
  "raw_score": 3,
  "max_score": 6,
  "feedback": "Missed full word 'software' and article 'a'.",
  "errors": "[{\"key\":\"word_substitution\",\"category\":\"listening\",\"original\":\"soft\",\"correction\":\"software\",\"note\":\"完整词未听清\"}]",
  "subcap_scores": "[{\"key\":\"listening.connected_speech\",\"value\":4.5,\"evidence\":\"弱读和词尾捕捉不稳\"}]",
  "metadata": "{\"replays\":1}"
}
```

`study_session_id` is auto-resolved from `session_id` if you don't pass it.

Abandoned write — minimal:

```json
{
  "action": "practice",
  "skill_type": "writing.essay",
  "session_id": "tg:12345",
  "completed": 0
}
```

## Writing skills: 4 IELTS sub-dims go to `subcap_scores`, not `samples.band_*`

In v3 the only band column on `samples` is `band_overall`. The four IELTS
sub-dims are written as subcap rows:

```json
{
  "action": "practice",
  "skill_type": "writing.essay",
  ...,
  "band_overall": 5.5,
  "subcap_scores": "[
    {\"key\":\"writing.task_achievement\",\"value\":6.0,\"evidence\":\"Position clear; second support weak.\"},
    {\"key\":\"writing.cohesion\",\"value\":6.0,\"evidence\":\"Paragraph breaks logical.\"},
    {\"key\":\"writing.lexical_range\",\"value\":5.5,\"evidence\":\"Repeated 'important' four times.\"},
    {\"key\":\"writing.grammar_accuracy\",\"value\":6.0,\"evidence\":\"One verb-form slip.\"}
  ]"
}
```

`learner_state_scores` reads these to compute the radar.

## Recent Practice

For in-session dedup (prompt_hash):

```json
{
  "action": "recent_practice",
  "skill_type": "listening.dictation",
  "limit": 5
}
```

For cross-session i+1 difficulty signal (survives Telegram session resets):

```json
{
  "action": "recent_practice",
  "scope": "global",
  "skill_type": "listening.dictation",
  "days": 14,
  "limit": 8
}
```

## Learner Summary

```json
{ "action": "study_summary", "days": 14 }
```

Returns aggregated samples / section bands / recurring errors (with derived
`last_30d_count` + `last_example` JSON) / weak subcaps with `avg_unaided`
(scaffold-stripped) / daily activity derived from samples / vocab mastery
counts.

## Learner State Scores (server-side EMA)

```json
{ "action": "learner_state_scores", "days": 14 }
```

Returns 4 section scores 0-100 (EMA-blended against last frozen snapshot),
`raw_current`, `sample_counts`, `confidence` (high/medium/low). LLM no
longer does the EMA math.

## Coaching Context

```json
{ "action": "coach_context", "days": 14, "limit": 8 }
```

Returns `profile`, `summary`, `due_words`, `personal_error_cards`.

## Learning Session Lifecycle

`session_start` is mostly optional — the first `practice` write auto-creates
an active session if none exists in the last 24h. Call it explicitly only
when you want to attach metadata or force a new session.

```json
{ "action": "session_start", "session_key": "tg:12345" }
```

```json
{ "action": "session_end", "study_session_id": 17, "status": "closed" }
```

## Progress Snapshots

```json
{
  "action": "progress_snapshot",
  "current_level": "B1",
  "notes": "Weekly learner-state refresh."
}
```

If the four `*_score` fields are omitted, persist falls back to the server-side
EMA from `learner_state_scores`.

```json
{ "action": "progress_trend", "limit": 8 }
```

## Profile Upsert

```json
{
  "action": "profile_upsert",
  "profile": "{\"initialized\":1,\"name\":\"Bolt\",\"current_level\":\"B1\",\"target_level\":\"B2\",\"target_exam\":\"IELTS\",\"exam_date\":\"2026-09-01\",\"interests\":[\"AI\",\"programming\"]}"
}
```

## Vocabulary

```json
{
  "action": "word_upsert",
  "word": "resilient",
  "item_kind": "word",
  "chinese": "有韧性的；恢复力强的",
  "ipa": "/rɪˈzɪl.i.ənt/",
  "pos": "adj",
  "topics": "[\"mindset\",\"growth\"]",
  "example_en": "She proved resilient under pressure.",
  "mastery": "queued_new",
  "origin": "user_lookup",
  "is_user_word": 1
}
```

Topics get mirrored into `lexical_topics`. Strict-match query:

```json
{ "action": "due_words", "topic": "mindset", "limit": 8 }
```

Mastered sweep (planner-driven, low frequency):

```json
{ "action": "due_words", "include_mastered": 1, "limit": 4 }
```

Per-card SRS update (rating canonical 0-5):

```json
{
  "action": "word_review",
  "word": "resilient",
  "rating": 4,
  "card_type": "recall",
  "sample_id": 91
}
```

Mastery transitions (server-side):
- `queued_new → learning` on first pass
- `learning → known` at `consecutive_success ≥ 3`
- `known → mastered` at `consecutive_success ≥ 5` AND `≥ 21 days since first success in streak`
- Any tier regresses by one on a failure (mastered → known → learning → queued_new)

## Item-kind Contract

| `item_kind` | `word` column holds | Notes |
| --- | --- | --- |
| `word` | single word | default |
| `chunk` | multi-word expression | collocation / phrase |
| `pattern` | sentence frame | reusable wording |
| `personal_error` | wrong phrase | `definition` holds the correction |

## Mastery / Origin Glossary

- `mastery`: `queued_new → learning → known → mastered` (regressible)
- `origin`: `auto_seed` / `user_lookup` / `manual_save` / `practice_harvest` / `dictionary_lookup` / `error-clinic`
- `transfer_level`: 0 seeded → 1 seen → 2 active-check pass → 3 spoke → 4 wrote
