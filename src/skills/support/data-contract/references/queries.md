# Typed Persist Recipes

Skills should not issue raw SQL against `study.db`. Use `persist` actions.
The schema is owned by the agent at `src/storage/study/study.sql` (skills do
not need to read it); treat `persist` as the data gateway.

## Practice Evidence

Use the post-practice protocol:

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
  "feedback": "The user missed the full word 'software' and the article 'a'.",
  "errors": "[{\"key\":\"word_substitution\",\"category\":\"listening\",\"original\":\"soft\",\"correction\":\"software\",\"note\":\"完整词未听清\"}]",
  "subcap_scores": "[{\"key\":\"listening.connected_speech\",\"score\":4.5,\"evidence\":\"弱读和词尾捕捉不稳\"}]"
}
```

If a session is abandoned, still call:

```json
{
  "action": "practice",
  "skill_type": "writing.essay",
  "session_id": "tg:12345",
  "completed": 0,
  "mode": "study"
}
```

## Learner Summary

For learner-state, coaching, and error-clinic:

```json
{
  "action": "study_summary",
  "days": 14
}
```

Returns aggregated samples, section bands, recurring errors, weak subcaps,
activity, and vocabulary mastery counts.

## Coaching Context

For private-coach style replies, prefer this higher-level aggregate:

```json
{
  "action": "coach_context",
  "days": 14,
  "limit": 8
}
```

Returns:

- `profile`: structured learner profile mirror from `learner_profile`
- `summary`: the same aggregates as `study_summary`
- `due_words`: SRS cards due now
- `due_tasks`: planned but unfinished study slots for today
- `personal_error_cards`: vocabulary-style cards created from the learner's own mistakes

Use this when a skill needs the user's learning state to feel personal rather
than generic. Do not dump the raw JSON to the learner; translate it into one
specific diagnosis, one pressure point, and one next action.

## Learning Session Lifecycle

When `/new` starts a deliberate learning block, open a study session:

```json
{
  "action": "session_start",
  "session_key": "tg:12345",
  "platform": "telegram",
  "entrypoint": "new",
  "plan": "{\"slots\":[{\"skill\":\"vocab-review\",\"minutes\":8},{\"skill\":\"listening-dictation\",\"minutes\":10}]}"
}
```

When the learner finishes, abandons, or the agent closes the block:

```json
{
  "action": "session_end",
  "session_key": "tg:12345",
  "status": "closed",
  "skills_used": "[\"vocab-review\",\"listening-dictation\"]",
  "summary_text": "Reviewed due words, then completed one i+1 dictation sentence."
}
```

`persist` derives `samples_count` and `minutes_total` from `samples.session_id`
when possible. Conversation history still belongs to `state.db`; `study_sessions`
only tracks the learning wrapper.

## Progress Snapshots

`learner-state` owns long-arc learning state. After refreshing `MEMORY.md`, it
can freeze the current week. Compute the fields in `learner-state`; `persist`
only stores the values:

```json
{
  "action": "progress_snapshot",
  "current_level": "B1",
  "listening_score": 67,
  "speaking_score": 61,
  "reading_score": 72,
  "writing_score": 58,
  "vocab_active_count": 42,
  "vocab_mature_count": 13,
  "total_minutes": 145,
  "active_days": 4,
  "sessions_count": 5,
  "samples_count": 18,
  "due_words_count": 9,
  "weak_subcaps": "[{\"subcap_key\":\"listening.connected_speech\",\"avg_score\":4.8}]",
  "top_errors": "[{\"recurrence_key\":\"article_missing\",\"seen_count\":6}]",
  "notes": "Weekly learner-state refresh after 14-day coach_context review."
}
```

Read recent frozen snapshots for reports or cron summaries:

```json
{
  "action": "progress_trend",
  "limit": 8
}
```

Future cron jobs should call learner-state or these `persist` actions. Other
practice skills should not write `progress_snapshots` directly.

## Profile Upsert

After profile-manager collects user facts, update structured profile data:

```json
{
  "action": "profile_upsert",
  "profile": "{\"initialized\":1,\"name\":\"Bolt\",\"current_level\":\"B1\",\"target_level\":\"IELTS 7.0\",\"exam_date\":\"2026-09-01\",\"daily_minutes\":30,\"interests\":[\"AI\",\"programming\"],\"weaknesses\":\"listening chunks and writing cohesion\"}"
}
```

`USER.md` remains the natural-language prompt summary. `learner_profile` is the
structured planning mirror.

## Daily Tasks

Create a planned task:

```json
{
  "action": "task_upsert",
  "domain": "writing",
  "task_type": "primary",
  "skill": "writing-builder",
  "mode": "study",
  "callback": "writing-builder",
  "reason": "Build sentence control before essay work.",
  "load_score": 2,
  "planned_minutes": 10
}
```

Read today's tasks:

```json
{
  "action": "due_tasks"
}
```

Mark a task complete after a practice write:

```json
{
  "action": "task_complete",
  "task_id": 12,
  "sample_id": 55
}
```

## Vocabulary Upsert

Save one word/chunk/pattern:

```json
{
  "action": "word_upsert",
  "word": "resilient",
  "item_kind": "word",
  "definition": "able to recover quickly",
  "chinese": "有韧性的；恢复力强的",
  "ipa": "/rɪˈzɪl.i.ənt/",
  "pos": "adj",
  "example_en": "She proved resilient under pressure.",
  "mastery": "queued_new",
  "origin": "user_lookup",
  "is_user_word": 1,
  "priority": 5
}
```

Save multiple harvested items:

```json
{
  "action": "word_upsert",
  "origin": "practice_harvest",
  "words": "[{\"word\":\"depend on\",\"item_kind\":\"chunk\",\"chinese\":\"依赖\",\"example_en\":\"I depend on public transport.\"},{\"word\":\"It is widely believed that...\",\"item_kind\":\"pattern\",\"chinese\":\"人们普遍认为...\"}]"
}
```

Personal-error cards also live in `words`:

```json
{
  "action": "word_upsert",
  "word": "depend of",
  "item_kind": "personal_error",
  "definition": "depend on",
  "chinese": "固定搭配 depend on",
  "example_en": "I depend on public transport.",
  "origin": "error-clinic"
}
```

## Vocabulary Reads

Due words for SRS:

```json
{
  "action": "due_words",
  "limit": 8
}
```

Lookup an item:

```json
{
  "action": "word_lookup",
  "word": "resilient"
}
```

## Vocabulary Review

After each flashcard result:

```json
{
  "action": "word_review",
  "word": "resilient",
  "session_id": "tg:12345",
  "rating": 4,
  "card_type": "recall",
  "context": "vocab-review"
}
```

Rating contract:

| Callback | rating | Meaning |
| --- | --- | --- |
| easy | 5 | Strong recall |
| hard | 3 | Partial recall, still passed |
| again | 1 | Failed recall |

## Item-kind Contract

| `item_kind` | `word` column holds | Notes |
| --- | --- | --- |
| `word` | single word | default |
| `chunk` | multi-word expression | collocation / phrase |
| `pattern` | sentence frame | reusable IELTS wording |
| `personal_error` | wrong phrase | `definition` holds the correction |

## Mastery / Origin Glossary

- `mastery`: `queued_new` → `learning` → `known` → `mastered`
- `origin`: `auto_seed` / `user_lookup` / `manual_save` / `practice_injected` / `briefing` / `auto_harvest`
- `transfer_level`: 0 seeded → 1 seen → 2 active-check pass → 3 spoke → 4 wrote
