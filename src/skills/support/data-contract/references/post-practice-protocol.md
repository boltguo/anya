# Post-Practice Write Protocol

Every training skill **must** call `persist` after each attempt. The `persist`
gateway handles the schema, transactions, abandoned-row fallbacks, error-key
validation, and subcap normalization in one atomic call. Time-series rollups
are derived on demand from `samples` + `study_sessions` (no rollup tables).

`MEMORY.md` is refreshed by `learner-state` — do NOT touch MEMORY directly.

---

## The `persist` Tool

> [!IMPORTANT]
> Use the `persist` tool — not raw `db`. Default `action="practice"` writes a
> sample row plus per-error and per-subcap evidence. Abandoned attempts go in
> through the same action with `completed=0`; you do **not** need to supply
> prompt/response/feedback in that case — persist fills placeholders.

### Required for completed sessions

| Parameter | Type | Notes |
|-----------|------|-------|
| `skill_type` | string | `listening.dictation`, `speaking.freetalk`, `writing.essay`, `vocab`, etc. |
| `session_id` | string | Telegram session key (`tg:...`). Filled server-side from the agent context, but skills should still set it. |
| `prompt` | string | The question/sentence/topic. **Never empty for completed sessions.** |
| `response` | string | The user's raw answer. **Never empty for completed sessions.** |
| `feedback` | string | **Natural language** diagnostic paragraph. Required for completed sessions. |

### Required for abandoned sessions (`completed=0`)

Only `skill_type` and `session_id` are required. If `prompt`/`response`/`feedback`
are empty, persist writes the canonical placeholders so downstream demote logic
still sees the failure. **Do not skip the write** — it is the only way the
"too hard → drop one tier" link works.

```json
{
  "action": "practice",
  "skill_type": "listening.dictation",
  "session_id": "tg:12345",
  "completed": 0,
  "minutes": 1
}
```

### Linking samples to a study block

Pass `study_session_id` (id returned by `session_start`) so the row joins to
its learning block. If you omit it, persist auto-resolves a recent active
study_session for the same `session_key` (24h idle window).

### Optional parameters

| Parameter | Type | Default | Notes |
|-----------|------|---------|-------|
| `accuracy` | number | null | 0.0–1.0 ratio. Omit for unscored (freetalk, journal). |
| `raw_score` | integer | null | Items correct (numerator). |
| `max_score` | integer | null | Items total (denominator). |
| `audio_path` | string | null | TTS file path (listening skills, enables Revenge). |
| `mode` | string | "study" | `study` \| `placement` |
| `completed` | integer | 1 | 0 = abandoned. **Write even if abandoned.** |
| `minutes` | integer | 1 | Approximate duration. |
| `section` | string | auto | `listening`/`speaking`/etc. Auto-inferred from `skill_type`. |
| `band_overall` | number | null | Overall band. Sub-dimensions (writing task/coherence/lexical/grammar) go to `subcap_scores`, NOT `samples.band_*` (those columns are gone in v3). |
| `parent_sample_id` | integer | null | For redo chains. |
| `assistance_level` | string | `none` | `none` \| `hint` \| `outline` \| `sos` \| `redo`. The only field that flags "user used scaffold" — drives learner-state's unaided-vs-aided split. |
| `prompt_hash` | string | "" | First 12 hex of `sha1(normalized prompt)`. See `prompt-hash.md`. |
| `metadata` | string | "" | JSON object string. **Use this for**: source_url, button_taps, replays, scaffolded reason, anything skill-owned. |
| `errors` | JSON string | [] | Array of error objects (see below). |
| `subcap_scores` | JSON string | [] | Array of subcap objects (see below). |

### Multi-turn skills

If a skill spans many turns (vocab batch, placement, roleplay), do NOT rely
on a `skill_runs` table — that mechanism was removed. Keep working state in
the LLM's chat history during the session, or write per-turn `samples` rows
(with `mode='placement'` for placement probes) so the conversation can be
reconstructed from the samples table.

### Error object format

Keys **must** come from `references/error-keys.md`. Unknown keys are silently
dropped and returned in `unknown_error_keys` in the response — treat that as a
contract violation in the skill code, not a recoverable error.

```json
[
  {"key": "function_word_miss", "category": "listening", "severity": "medium", "original": "", "correction": "the", "note": "冠词漏听"},
  {"key": "word_substitution", "category": "listening", "severity": "medium", "original": "soft", "correction": "software", "note": "词汇截断"}
]
```

### Subcap-score object format

All values on the canonical **0-10 scale**. No scale fields, no normalized
column — `learner_state_scores` multiplies by 10 to express on 0-100.
Scaffolded evidence is identified by joining to `samples.assistance_level`.

```json
[
  {"key": "listening.connected_speech", "value": 4.5, "evidence": "弱读冠词遗漏"}
]
```

Legacy shape `{"key", "score", "evidence"}` is accepted (`score` aliases `value`).

---

## Feedback Spec

`feedback` must be a natural-language textual analysis. Do not use JSON.
Write a concise but detailed diagnostic paragraph about what exactly the user
missed, the root cause, and overall performance.

Example: "The user missed the definite article 'the' and heard 'released' as
'release'. This indicates weak sensitivity to word-final sounds and connected
speech of weak forms, though they successfully caught the main sentence
structure."

---

## Complete Examples

### Example: listening.dictation

```json
{
  "skill_type": "listening.dictation",
  "session_id": "tg:12345",
  "study_session_id": 17,
  "prompt": "The software engineer is coding a new game.",
  "response": "The soft engineer was coding new game",
  "accuracy": 0.5,
  "raw_score": 3,
  "max_score": 6,
  "feedback": "The user heard 'software' as 'soft' and missed the article 'a'. This indicates weak sensitivity to word-final sounds and function words in connected speech.",
  "audio_path": "/path/to/audio.ogg",
  "minutes": 1,
  "errors": "[{\"key\":\"word_substitution\",\"category\":\"listening\",\"original\":\"soft\",\"correction\":\"software\",\"note\":\"完整词汇未听清\"},{\"key\":\"function_word_miss\",\"category\":\"grammar\",\"original\":\"\",\"correction\":\"a\",\"note\":\"冠词漏听\"},{\"key\":\"tense_miss\",\"category\":\"grammar\",\"original\":\"was coding\",\"correction\":\"is coding\",\"note\":\"时态错误\"}]",
  "subcap_scores": "[{\"key\":\"listening.connected_speech\",\"value\":4.5,\"scale_min\":0,\"scale_max\":10,\"evidence\":\"弱读冠词和词尾辅音遗漏\"}]"
}
```

### Example: speaking.freetalk

```json
{
  "skill_type": "speaking.freetalk",
  "session_id": "tg:12345",
  "study_session_id": 17,
  "prompt": "Should AI replace human teachers?",
  "response": "I think AI can help but not replace teachers because...",
  "feedback": "Good flow but lacked advanced vocabulary. A few filler words used.",
  "minutes": 3,
  "errors": "[{\"key\":\"verb_form_error\",\"category\":\"grammar\",\"original\":\"can helps\",\"correction\":\"can help\",\"note\":\"情态动词后用原形\"}]",
  "subcap_scores": "[{\"key\":\"speaking.fluency\",\"value\":5.5,\"scale_min\":0,\"scale_max\":10,\"evidence\":\"中等停顿\"},{\"key\":\"speaking.lexical_variety\",\"value\":5.0,\"scale_min\":0,\"scale_max\":10,\"evidence\":\"基础词汇为主\"}]"
}
```

### Example: vocab batch

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
  "minutes": 3,
  "words_reviewed": 6
}
```

(Per-card SRS update happens through `persist action="word_review"` — not in
this batch row.)

### Example: abandoned writing-essay

```json
{
  "skill_type": "writing.essay",
  "session_id": "tg:12345",
  "study_session_id": 17,
  "completed": 0,
  "minutes": 2,
  "metadata": "{\"reason\":\"user_quit_at_outline\"}"
}
```

---

## SRS rating contract (vocab skills)

All vocab skills must normalize to the canonical 0–5 rating before calling
`word_review`. Persist applies SM-2 with ease engaged from the first review
and mastery transitions that allow regression on failure.

| Skill UX label  | rating | Meaning |
|-----------------|--------|---------|
| 🎯 Easy / 秒懂   | 5 | Clean recall |
| ✅ Correct      | 4 | Right answer but with hesitation |
| 🤔 Hard / 模糊   | 3 | Partial / shaky — passes barely |
| ❌ Wrong / 忘了 | 1 | Failed recall |
| (Blank)         | 0 | Total blank |

Mastery transitions (server-side):
- queued_new → learning  on first pass
- learning  → known      on consecutive_success ≥ 3
- known     → mastered   on consecutive_success ≥ 5 AND ≥ 21 days since first success in streak
- any-pass-tier → previous tier on fail (mastered → known → learning → queued_new)

`due_words` returns mastered items only when `include_mastered=1` is set
explicitly (planner-driven Ebbinghaus sweep).

---

## Do NOT

- Do NOT update MEMORY.md directly — `learner-state` skill handles that
- Do NOT skip writes for abandoned sessions — use `completed=0`
- Do NOT invent error keys — only the whitelisted ones in `references/error-keys.md` will be stored
- Do NOT use JSON in `feedback` — must be natural language analysis
- Do NOT use raw `db` calls for English learning data — use the `persist` tool
- DO keep multi-turn working state in the LLM's chat history; the `skill_runs` table was removed. Write per-turn `samples` rows so the conversation is reconstructible from the DB if needed.
