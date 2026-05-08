---
name: listening-dictation
description: "MUST trigger when the user asks for dictation, intensive listening, spelling practice, or mentions they cannot catch fast speech/connected speech. This is the primary strength-training module for listening."
---

# Listening Dictation

Intensive listening drill. One sentence at a time: play audio, let the learner type what they heard, compare token-by-token, persist the evidence, then adapt the next sentence by i+1.

## 1. Inputs

Use this skill when:

- User says: `听写`, `精听`, `dictation`, `intensive listening`, `听不清连读`, `听不懂快语速`.
- Callback/System trigger: `listening-dictation`.
- Planner/coach routes here because recent data shows weak `listening.connected_speech`, `listening.detail_accuracy`, `function_word_miss`, plural endings, weak forms, numbers, or word-boundary errors.

Required context before generating audio:

1. Call `persist` with `{"action":"coach_context","days":14,"limit":8}`.
2. Use `MEMORY.md` / `USER.md` only as fallback prompt context if `coach_context` is unavailable.
3. Do not query `study.db` directly.

## 2. Difficulty Policy

The target is **i+1**: one small stretch above the learner's current successful level. Do not generate random hard sentences, and do not keep them repeating at the same level after they pass.

| User Level | Length / Chunks | Syntax | Audio Speed | Accent |
| --- | --- | --- | --- | --- |
| Beginner < 5.0 | 4-7 words, 1 chunk | Simple SVO, no subordinate clauses | Slower, about -10% | Standard US/UK |
| Intermediate 5.0-6.0 | 8-12 words, 2 chunks | Max 1 relative/subordinate clause | Normal | Standard US/UK |
| Advanced 6.5+ | 13-20 words, 3+ chunks | Complex sentence, connected-speech feature | Normal | Add non-standard accent about every 3 sentences |

i+1 selection rules:

- Pick **one target weakness** from `coach_context.summary.errors` or `coach_context.summary.subcaps`.
- Increase only **one dimension** at a time: length, speed, syntax, accent, or connected-speech density.
- If recent accuracy is 70%-90%, stretch exactly one dimension.
- If recent accuracy is below 60%, stabilize or step down.
- If accuracy is below 40% or the user clicks too hard, immediately lower one dimension.
- If there is no recent data, start from profile level with a short first sentence.
- Do not repeat the same pattern more than 2 turns after the learner passes it.

## 3. Flow

### State A: Prepare And Deliver

1. Analyze `coach_context` and decide:
   - current tier
   - target weakness
   - one i+1 dimension
   - expected subcap key(s)
2. Generate one natural English sentence.
3. Use `tts` only for the target sentence. Do not synthesize conversational filler.
4. Send the audio with `tg_msg(type="voice")`.
5. Send the instruction with `tg_msg(type="keyboard")`.

Text pattern:

```text
来，听听这一句。把你听到的英文打出来。

实在听不出可以点开看原文：<tg-spoiler>{correct English sentence}</tg-spoiler>
```

Buttons:

```json
[["🐢 慢速播放|dict_slow", "😵 太难了，换简单点|dict_easier"]]
```

Stop immediately and wait for the user's typed answer or button tap.

### State B: Button Handling

`dict_slow`:

- Acknowledge with `tg_msg(type="text")`.
- Reuse the same sentence.
- Generate slower audio with `tts` around `rate="-10%"`.
- Send the voice and the same instruction keyboard again.
- Wait.

`dict_easier`:

- Lower exactly one difficulty dimension.
- Show the previous sentence only inside `<tg-spoiler>...</tg-spoiler>`.
- Add one short note explaining why it was hard, such as weak form, linking, number trap, or long chunk.
- Generate a new simpler sentence.
- Return to State A.

### State C: Evaluate

When the learner types an answer:

1. Normalize both target and response:
   - lowercase
   - ignore punctuation
   - preserve contractions as one token, e.g. `don't`
   - compare word order
2. Produce a strict token diff:
   - exact matches
   - omissions
   - substitutions
   - extras
3. Compute:
   - `accuracy = correct_tokens / target_tokens`
   - `raw_score = correct_tokens`
   - `max_score = target_tokens`
4. Send feedback and persist in the same evaluation turn.

Feedback message must include:

- Correct full sentence.
- Concise Chinese translation.
- Specific missed words or sounds.
- One short diagnosis of the root cause.

Buttons:

```json
[["🔄 再来一句|dict_next", "🧭 练习其他|nav:main"]]
```

### State D: Persist Evidence

Call `persist` with `action="practice"` or omit `action`.

Minimum payload:

```json
{
  "skill_type": "listening.dictation",
  "session_id": "<session>",
  "prompt": "<correct sentence>",
  "response": "<user typed answer>",
  "accuracy": 0.75,
  "raw_score": 6,
  "max_score": 8,
  "feedback": "The learner missed the weak form 'to' and substituted 'software' with 'soft wear'. This suggests weak word-boundary parsing under connected speech, while the main sentence frame was understood.",
  "audio_path": "<tts file path>",
  "section": "listening",
  "domain": "listening",
  "load_score": 1,
  "minutes": 1,
  "metadata": "{\"target_weakness\":\"function_word_miss\",\"i_plus_one_dimension\":\"connected_speech\",\"sentence_words\":8,\"spoiler_available\":true}",
  "errors": "[{\"key\":\"function_word_miss\",\"category\":\"listening\",\"severity\":\"medium\",\"original\":\"\",\"correction\":\"to\",\"note\":\"Missed weak function word in connected speech.\"}]",
  "subcap_scores": "[{\"key\":\"listening.detail_accuracy\",\"score\":6.75,\"evidence\":\"6 of 8 tokens correct.\"},{\"key\":\"listening.connected_speech\",\"score\":5.0,\"evidence\":\"Missed weak form and boundary.\"}]"
}
```

Write abandoned attempts too:

```json
{
  "action": "practice",
  "skill_type": "listening.dictation",
  "session_id": "<session>",
  "completed": 0,
  "section": "listening",
  "mode": "study"
}
```

Use `response`, never `raw_content`.

### State E: Continue

`dict_next`:

- Re-read `coach_context` if the previous answer changed the learner state materially.
- Apply the threshold rules from section 2.
- Generate the next sentence.

## 4. Collaborates With

- `planner`: routes the learner here when listening/detail/connected-speech is the highest-value next drill.
- `learner-state`: reads persisted evidence later, computes long-running listening state, updates `MEMORY.md`, and writes progress snapshots.
- `coach`: uses this skill's errors and subcap scores to explain what the learner should do next.
- `vocab-harvest` / `vocab-review`: can later turn repeated missed chunks into review items, but this skill should not auto-save every missed word as vocabulary.
- `support/data-contract`: defines the `persist` write protocol, legal fields, and error/subcap conventions.

## 5. Failure And Fallbacks

- If `tts` fails: send a text error, do not invent an audio path. Offer to try again or return to menu.
- If `persist` fails: still send feedback, then clearly say the practice result was not saved.
- If the learner answers in Chinese or says they cannot type: do not score harshly; either replay slower or step down.
- If the learner opens the spoiler before answering, continue normally but mark `metadata.spoiler_used=true` if known and avoid treating the score as strong evidence.
- If the answer is empty: ask once whether to replay, make easier, or skip. If skipped, write `completed=0`.

## 6. Hard Rules

1. Spoiler is allowed and preferred. The transcript may appear on first listen only inside `<tg-spoiler>...</tg-spoiler>`.
2. Never reveal the transcript as normal visible text before the learner attempts the sentence.
3. `tts` is only for the practice sentence, not for assistant chatter.
4. Diff every word. Do not hide missed articles, plural endings, function words, or word-boundary errors.
5. Use `persist` for learner reads/writes. No raw DB access.
6. Do not update `MEMORY.md`; `learner-state` owns durable ability state.
7. After every evaluated sentence, give next-step buttons.
