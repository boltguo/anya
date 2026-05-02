# Post-Practice Write Protocol

Every training skill **must** use the `persist` tool to write practice data after each session.
MEMORY.md is refreshed separately by `learner-state` — do NOT update MEMORY directly.

## The `persist` Tool

> [!IMPORTANT]
> Use the `persist` tool instead of raw `db` calls. It handles all SQL, transactions, and `activity_log` upserts automatically. Just fill in the structured parameters.

### Required Parameters

| Parameter | Type | Notes |
|-----------|------|-------|
| `skill_type` | string | `listening.dictation`, `speaking.freetalk`, `writing.essay`, `vocab`, etc. |
| `session_id` | string | From `[Session: tg:...]` in the prompt |
| `prompt` | string | The question/sentence/topic. **Never empty.** |
| `response` | string | The user's raw answer. **Never empty.** |
| `feedback` | string | **Natural language** diagnostic paragraph (NOT JSON). |

### Optional Parameters

| Parameter | Type | Default | Notes |
|-----------|------|---------|-------|
| `accuracy` | number | null | 0.0–1.0 ratio. Omit for unscored (freetalk, journal). |
| `raw_score` | integer | null | Items correct (numerator). |
| `max_score` | integer | null | Items total (denominator). |
| `load_score` | number | 2 | 1=light drill, 2=standard, 3=heavy. |
| `audio_path` | string | null | TTS file path (listening skills, enables Revenge). |
| `mode` | string | "study" | `study` \| `exam` \| `placement` |
| `completed` | integer | 1 | 0 = abandoned. **Write even if abandoned.** |
| `minutes` | integer | 1 | Approximate duration for `activity_log`. |
| `section` | string | auto | `listening`/`speaking`/etc. Auto-inferred from `skill_type`. |
| `words_reviewed` | integer | 0 | For vocab skills. |
| `errors` | JSON string | [] | Array of error objects (see below). |
| `subcap_scores` | JSON string | [] | Array of subcap objects (see below). |

### Error Object Format

Keys **must** come from `references/error-keys.md`.

```json
[
  {"key": "function_word_miss", "category": "listening", "severity": "medium", "original": "", "correction": "the", "note": "冠词漏听"},
  {"key": "word_substitution", "category": "listening", "severity": "medium", "original": "soft", "correction": "software", "note": "词汇截断"}
]
```

### Subcap Score Object Format

```json
[
  {"key": "listening.connected_speech", "score": 4.5, "evidence": "弱读冠词遗漏"}
]
```

---

## Feedback Spec

`feedback` must be a natural language textual analysis. Do not use JSON.
Write a concise but detailed diagnostic paragraph about what exactly the user missed, the root cause, and overall performance.

Example: "The user missed the definite article 'the' and heard 'released' as 'release'. This indicates weak sensitivity to word-final sounds and connected speech of weak forms, though they successfully caught the main sentence structure."

---

## Complete Examples

### Example: listening.dictation

Call the `persist` tool natively with these arguments:

```json
{
  "skill_type": "listening.dictation",
  "session_id": "tg:12345",
  "prompt": "The software engineer is coding a new game.",
  "response": "The soft engineer was coding new game",
  "accuracy": 0.5,
  "raw_score": 3,
  "max_score": 6,
  "feedback": "The user heard 'software' as 'soft' and missed the article 'a'. This indicates weak sensitivity to word-final sounds and function words in connected speech.",
  "audio_path": "/path/to/audio.ogg",
  "load_score": 1,
  "minutes": 1,
  "errors": "[{\"key\":\"word_substitution\",\"category\":\"listening\",\"original\":\"soft\",\"correction\":\"software\",\"note\":\"完整词汇未听清\"},{\"key\":\"function_word_miss\",\"category\":\"grammar\",\"original\":\"\",\"correction\":\"a\",\"note\":\"冠词漏听\"},{\"key\":\"tense_miss\",\"category\":\"grammar\",\"original\":\"was coding\",\"correction\":\"is coding\",\"note\":\"时态错误\"}]",
  "subcap_scores": "[{\"key\":\"listening.connected_speech\",\"score\":4.5,\"evidence\":\"弱读冠词和词尾辅音遗漏\"}]"
}
```

### Example: speaking.freetalk

Call the `persist` tool natively with these arguments:

```json
{
  "skill_type": "speaking.freetalk",
  "session_id": "tg:12345",
  "prompt": "Should AI replace human teachers?",
  "response": "I think AI can help but not replace teachers because...",
  "feedback": "Good flow but lacked advanced vocabulary. A few filler words used.",
  "load_score": 2,
  "minutes": 3,
  "errors": "[{\"key\":\"verb_form_error\",\"category\":\"grammar\",\"original\":\"can helps\",\"correction\":\"can help\",\"note\":\"情态动词后用原形\"}]",
  "subcap_scores": "[{\"key\":\"speaking.fluency\",\"score\":5.5,\"evidence\":\"中等停顿\"},{\"key\":\"speaking.lexical_variety\",\"score\":5.0,\"evidence\":\"基础词汇为主\"}]"
}
```

### Example: vocab review

Call the `persist` tool natively with these arguments:

```json
{
  "skill_type": "vocab",
  "session_id": "tg:12345",
  "prompt": "review-batch",
  "response": "resilient:pass, fluctuate:fail",
  "accuracy": 0.83,
  "raw_score": 5,
  "max_score": 6,
  "feedback": "Recalled most words but struggled with 'fluctuate' in production.",
  "load_score": 2,
  "minutes": 3,
  "words_reviewed": 6
}
```

## Do NOT

- Do NOT update MEMORY.md directly — `learner-state` skill handles that
- Do NOT skip writes for abandoned sessions — use `completed=0`
- Do NOT invent error keys — use `references/error-keys.md`
- Do NOT use JSON in `feedback` — must be natural language analysis
- Do NOT leave `prompt` or `response` empty
- Do NOT use raw `db` calls for post-practice writes — **use the `persist` tool**
