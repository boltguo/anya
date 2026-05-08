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

The target is **i+1**: one small stretch above the learner's current successful level. Adapt sentence length and syntax to the learner's tier; never generate random hard sentences, and never keep repeating the same length/pattern after they pass.

### 2.1 Tier table (length & syntax only)

Audio is always rendered at **standard 100% speed**. Slow-down is a per-round reactive tool exposed via the `dict_slow` button — it is **not** a tier property and does **not** belong here.

| Tier (Listening band) | Sentence length | Syntax | Accent |
| --- | --- | --- | --- |
| Beginner (< 5.0) | 4–7 words, 1 chunk | Simple SVO, no subordinate clauses | Standard US/UK only |
| Intermediate (5.0–6.0) | 8–12 words, 2 chunks | Max 1 relative/subordinate clause | Standard US/UK only |
| Advanced (≥ 6.5) | 13–20 words, 3+ chunks | Complex syntax, connected-speech feature | Standard US/UK; non-standard accent only after the learner is stable inside Advanced |

### 2.2 Recent-accuracy window (the signal that drives adaptation)

"Recent accuracy" is **strictly defined** as:

1. **Primary** — mean `accuracy` over the last **3** `completed=1` samples of `skill_type='listening.dictation'` in the **current session** (`session_id`).
2. **Fallback** — if the current session has fewer than 3 completed samples, use the 14-day mean from `coach_context.summary` (`persist action="coach_context"` already returned in §1).
3. **Cold start** — if neither is available, treat the learner as one tier below their declared profile band and start at the **minimum** length of that tier.

Single-sample swings are ignored. The window is always 3.

### 2.3 Streak gating (no single sample changes the tier)

Track two running counters in the session: `pass_streak` (consecutive `accuracy ≥ 0.80`) and `fail_streak` (consecutive `accuracy < 0.60`). A round in the 0.60–0.80 band is a "hold" and resets neither counter (it leaves them as-is — does **not** increment, does **not** reset; resets only happen on the opposite outcome).

| Streak | Action |
| --- | --- |
| `pass_streak ≥ 2` at the **current tier ceiling** (length = tier max) | Promote to the next tier; reset both streaks; start at next tier's minimum length. |
| `pass_streak ≥ 2` **inside** the tier (length < tier max) | Stay in tier; bump sentence length by **+1 word** (clamped to tier max); reset `pass_streak`. |
| `fail_streak ≥ 2` at the **current tier floor** (length = tier min) | Demote to previous tier; reset both streaks; start at previous tier's max length. |
| `fail_streak ≥ 2` **inside** the tier (length > tier min) | Stay in tier; drop sentence length by **−1 word** (clamped to tier min); reset `fail_streak`. |
| Hard-button tap (`dict_easier`) | Equivalent to one immediate `fail_streak += 1`; if that reaches 2, apply the demotion rule above. The abandoned-record persist (State B) is independent of streak. |

Hold rounds (0.60–0.80): keep the same length, optionally swap **one** dimension among syntax/accent/connected-speech if the learner is mid-tier and you want to probe a specific weakness from `coach_context.summary.errors`.

### 2.4 Generation rules

- Pick **one target weakness** from `coach_context.summary.errors` or `coach_context.summary.subcaps` (e.g. `function_word_miss`, `listening.connected_speech`).
- Each new sentence may stretch **at most one** dimension beyond the previous: length, syntax, accent, or connected-speech density. Never combine two stretches in one round.
- Do **not** repeat a sentence whose `prompt_hash` already appears in `metadata.recent_prompts_seen` for the current session (see §3 State D).
- Do not repeat the same syntactic pattern (e.g. cleft sentences, embedded `that`-clauses) for more than 2 consecutive rounds.

## 3. Flow

### State A: Prepare And Deliver

1. Analyze `coach_context` and the session's running counters; decide:
   - current tier and current sentence length within that tier (from §2.3 streak rules)
   - target weakness
   - one i+1 dimension to stretch (or "hold" if mid-band)
   - expected subcap key(s)
2. Generate one natural English sentence at the chosen length / syntax / accent. **Avoid duplicates within the session**: compute `prompt_hash` (see §3 State D) and reject the candidate if its hash already appears in this session's `recent_prompts_seen`; regenerate until you have a fresh one.
3. Use `tts` only for the target sentence at standard 100% speed. Do not synthesize conversational filler. Do not slow the audio at this step — slow-down is reserved for the `dict_slow` button in State B.
4. Send the audio with `tg_msg(type="voice")`.
5. Send the instruction with `tg_msg(type="keyboard")`.
6. **Initialize a per-round `ui_feedback` accumulator** (empty string). Every button tap below MUST append the exact button label so it can be persisted later as evidence — even if the learner eventually nails the sentence.

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

- **Append `🐢 慢速播放` to the round's `ui_feedback` accumulator** (this is mandatory — it survives into the final State D persist call so a "passed but only after slow-down" attempt is not mistaken for clean comprehension).
- Acknowledge with `tg_msg(type="text")`.
- Reuse the same sentence.
- Generate slower audio with `tts` around `rate="-10%"`.
- Send the voice and the same instruction keyboard again.
- Wait.

`dict_easier`:

- **STEP 1 — Negative Evidence Lock-in (MANDATORY, before anything else).** The high-difficulty sentence the learner just abandoned is the most valuable signal `learner-state` can get; it MUST be written to the database before being replaced. Call `persist` immediately with the abandoned record:

  ```json
  {
    "action": "practice",
    "skill_type": "listening.dictation",
    "session_id": "<session>",
    "completed": 0,
    "accuracy": 0,
    "prompt": "<the sentence that was just too hard>",
    "prompt_hash": "<sha1(normalized prompt) first 16 chars>",
    "response": "",
    "feedback": "Learner tapped '太难了' before answering. Treat as negative evidence at this difficulty/dimension.",
    "audio_path": "<tts file path of the abandoned sentence>",
    "ui_feedback": "😵 太难了",
    "section": "listening",
    "domain": "listening",
    "load_score": 0,
    "minutes": 0,
    "mode": "study",
    "metadata": "{\"abandoned_reason\":\"too_hard\",\"sentence_words\":<n>,\"i_plus_one_dimension\":\"<dim>\",\"recent_prompts_seen\":[\"<hash1>\",\"<hash2>\",\"...\"]}"
  }
  ```

  After this `persist` call returns, **reset the round** — start a new `ui_feedback` accumulator for the next sentence.

- **STEP 2 — Replacement.** Apply the demotion / length-down rule from §2.3 (a hard-tap counts as `fail_streak += 1`). Show the previous sentence only inside `<tg-spoiler>...</tg-spoiler>`. Add one short note explaining why it was hard, such as weak form, linking, number trap, or long chunk. Generate a new simpler sentence at the new length and add the abandoned sentence's `prompt_hash` to `recent_prompts_seen` so it is not regenerated this session. Return to State A.

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
  "prompt_hash": "<sha1(normalized prompt) first 16 chars>",
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
  "ui_feedback": "<comma-joined exact labels of every button tapped this round, e.g. '🐢 慢速播放' — leave empty string if no button was tapped>",
  "metadata": "{\"target_weakness\":\"function_word_miss\",\"i_plus_one_dimension\":\"connected_speech\",\"sentence_words\":8,\"tier\":\"intermediate\",\"length_in_tier\":8,\"pass_streak_after\":1,\"fail_streak_after\":0,\"recent_prompts_seen\":[\"<hash_now>\",\"<hash_prev>\",\"...\"]}",
  "errors": "[{\"key\":\"function_word_miss\",\"category\":\"listening\",\"severity\":\"medium\",\"original\":\"\",\"correction\":\"to\",\"note\":\"Missed weak function word in connected speech.\"}]",
  "subcap_scores": "[{\"key\":\"listening.detail_accuracy\",\"score\":6.75,\"evidence\":\"6 of 8 tokens correct.\"},{\"key\":\"listening.connected_speech\",\"score\":5.0,\"evidence\":\"Missed weak form and boundary.\"}]"
}
```

**`prompt_hash` & `metadata.recent_prompts_seen` (mandatory).**

- `prompt_hash` = first 16 hex chars of SHA-1 over the **normalized** prompt: lowercased, punctuation stripped, whitespace collapsed. Two sentences that differ only in casing/punctuation collide intentionally — they are equivalent dictation items.
- `metadata.recent_prompts_seen` carries the last **20** `prompt_hash` values from the current session in chronological order (oldest first), with the newest (= this round's hash) at the end. Each new `persist` call rewrites this list — it is the agent's canonical short-term dedup memory.
- State A consults this list before generating; if a candidate hash already appears, regenerate. State B (`dict_easier`) appends the abandoned sentence's hash to the list before generating a replacement.

**`ui_feedback` is mandatory whenever any 🐢/😵 button was tapped this round**, even if the final `accuracy` is 1.0. Without it, `learner-state` cannot tell apart a genuinely confident pass from a "passed only after slow-down" pass and may over-promote the level.

Abandoned-on-too-hard records are written by State B (`dict_easier`) before the replacement sentence is generated — do not duplicate them here. State D only persists fully-attempted sentences (with or without slow-down).

Use `response`, never `raw_content`.

### State E: Continue

`dict_next`:

- Update `pass_streak` / `fail_streak` from the just-persisted sample's `accuracy` (≥0.80 → `pass_streak += 1`, `fail_streak = 0`; <0.60 → `fail_streak += 1`, `pass_streak = 0`; in-between → leave both unchanged).
- Apply the streak rules in §2.3 to decide the next round's tier and length **before** generating.
- Re-read `coach_context` only if the previous answer changed the learner state materially (e.g., a streak just promoted/demoted the tier); otherwise reuse the cached context to save a round-trip.
- Generate the next sentence (Step 2 of State A — including the `recent_prompts_seen` dedup check).

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
