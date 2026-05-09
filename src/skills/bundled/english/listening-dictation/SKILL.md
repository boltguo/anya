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

1. Call `persist` with `{"action":"recent_practice","session_id":"<session>","skill_type":"listening.dictation","limit":"DEDUP_WINDOW"}`. Returns recent samples (incl. abandoned) + flat `recent_prompt_hashes`. Source of truth for §2.3 credit and §2.4 dedup; do not duplicate hashes in `metadata`.
2. Call `persist` with `{"action":"coach_context","days":14,"limit":8}` for the longer-window aggregate (subcaps, errors, due words). Slower-moving signal — only re-call when tier changes.
3. Use `MEMORY.md` / `USER.md` only as fallback prompt context if both calls are unavailable.
4. Do not query `study.db` directly.

## 2. Difficulty Policy

The target is **i+1**: one small stretch above the learner's current successful level. Adapt sentence length and syntax to the learner's tier; never generate random hard sentences, and never keep repeating the same length/pattern after they pass.

### 2.1 Constants & Tier

| Constant | Value | Meaning |
| --- | --- | --- |
| `PASS_THRESHOLD` | `0.80` | A round with `accuracy ≥ PASS_THRESHOLD` counts as a pass. |
| `FAIL_THRESHOLD` | `0.60` | Below this is a fail; `[FAIL, PASS)` is a "hold". |
| `STREAK` | `2` | Consecutive passes (or fails) needed to move length / tier. |
| `ACC_WINDOW` | `3` | Sample window for §2.2 recent-accuracy mean. |
| `DEDUP_WINDOW` | `20` | Rolling `prompt_hash` window fetched via `recent_practice` (§1). |

Standard 100% speed only. Slow-down is the `dict_slow` button (State B), not a tier property.

| Tier (Listening band) | Sentence length | Syntax | Accent |
| --- | --- | --- | --- |
| Beginner (< 5.0) | 4–7 words, 1 chunk | Simple SVO, no subordinate clauses | Standard US/UK only |
| Intermediate (5.0–6.0) | 8–12 words, 2 chunks | Max 1 relative/subordinate clause | Standard US/UK only |
| Advanced (≥ 6.5) | 13–20 words, 3+ chunks | Complex syntax, connected-speech feature | Standard US/UK; non-standard accent only after stable inside Advanced |

### 2.2 Recent-accuracy window

Recent accuracy means:

1. **Primary** — mean `accuracy` over the last `ACC_WINDOW` `completed=1` rows in `recent_practice.rows` (filtered by `skill_type='listening.dictation'` and current `session_id`). Abandoned (`completed=0`) excluded from mean but count as fail for `demotion_credit` (see §2.3).
2. **Fallback** — if fewer than `ACC_WINDOW` completed rows, use the 14-day mean from `coach_context.summary`.
3. **Cold start (profile present)** — if neither sample source is available but `MEMORY.md` has a declared listening band, treat learner as one tier below that band and start at the **minimum** length of that tier.
4. **Cold start (no profile)** — if even the listening band is missing, start at **Beginner tier, minimum length** (4 words). Never guess upward.

### 2.3 Credit gating — `promotion_credit` / `demotion_credit`

Track two running counters across the session, computed from `recent_practice.rows` (§1):

```
promotion_credit = walk recent_practice.rows newest→oldest (skip redo_count>0):
  count consecutive accuracy ≥ PASS; reset on any fail (< FAIL or completed=0); holds ([FAIL, PASS)) pass through.
demotion_credit = mirror: count consecutive fail; reset on any pass; holds pass through.
abandoned (completed=0) = 1 fail.
```

| Credit | Action |
| --- | --- |
| `promotion_credit ≥ STREAK` at the **current tier ceiling** (length = tier max) | Promote to the next tier; reset both credits; start at next tier's minimum length. |
| `promotion_credit ≥ STREAK` **inside** the tier (length < tier max) | Stay in tier; bump sentence length by **+1 word** (clamped to tier max); reset `promotion_credit`. |
| `demotion_credit ≥ STREAK` at the **current tier floor** (length = tier min) | Demote to previous tier; reset both credits; start at previous tier's max length. |
| `demotion_credit ≥ STREAK` **inside** the tier (length > tier min) | Stay in tier; drop sentence length by **−1 word** (clamped to tier min); reset `demotion_credit`. |
| Hard-button tap (`dict_easier`) | Persists an abandoned row (State B), surfaced as a fail next `recent_practice` call — no separate counter bookkeeping. |

Retry rows (`redo_count > 0`) skipped from credit; still count for dedup.

Hold rounds: keep the same length, optionally swap **one** dimension among syntax/accent/connected-speech if the learner is mid-tier and you want to probe a specific weakness from `coach_context.summary.errors`.

### 2.4 Generation rules

- Pick **one target weakness** from `coach_context.summary.errors` or `coach_context.summary.subcaps` (e.g. `function_word_miss`, `listening.connected_speech`).
- Each new sentence may stretch **at most one** dimension beyond the previous: length, syntax, accent, or connected-speech density. Never combine two stretches in one round.
- Do **not** repeat a sentence whose `prompt_hash` already appears in `recent_practice.recent_prompt_hashes`.
- Do not repeat the same syntactic pattern (e.g. cleft sentences, embedded `that`-clauses) for more than 2 consecutive rounds.

## 3. Flow

### State A: Prepare And Deliver

1. Analyze `coach_context` plus the `promotion_credit` / `demotion_credit` derived from `recent_practice.rows` (§2.3); decide:
   - current tier and current sentence length within that tier (from §2.3 credit rules)
   - target weakness
   - one i+1 dimension to stretch (or "hold" if mid-band)
   - expected subcap key(s)
2. Generate one natural English sentence at the chosen length / syntax / accent. Compute `prompt_hash` (see State D) and reject if it already appears in `recent_practice.recent_prompt_hashes`; regenerate until fresh.
3. Use `tts` only for the target sentence at standard 100% speed. Do not synthesize conversational filler. Do not slow the audio at this step.
4. Send the audio with `tg_msg(type="voice")`.
5. Send the instruction with `tg_msg(type="keyboard")`.
6. Initialize empty `ui_feedback` accumulator; every button tap appends its exact label.

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

- Append `🐢 慢速播放` to the round's `ui_feedback` accumulator.
- Acknowledge with `tg_msg(type="text")`.
- Reuse the same sentence.
- Generate slower audio with `tts` around `rate="-10%"`.
- Send the voice and the same instruction keyboard again.
- Wait.

`dict_easier`:

- **STEP 1 — Persist abandoned record first** (before the replacement). Same envelope as State D's `persist` call, with these differences:

  ```
  completed=0, accuracy=0, response="",
  feedback="Learner tapped '太难了' before answering. Treat as negative evidence at this difficulty/dimension.",
  ui_feedback="😵 太难了", load_score=0, minutes=0,
  metadata={"abandoned_reason":"too_hard","sentence_words":<n>,"i_plus_one_dimension":"<dim>"}
  ```

  After persist returns, reset `ui_feedback` for the next round.

- **STEP 2 — Replacement.** Apply the demotion / length-down rule from §2.3. Show the previous sentence only inside `<tg-spoiler>...</tg-spoiler>`. Add one short note explaining why it was hard (weak form, linking, number trap, long chunk). Generate a new simpler sentence at the new length. Return to State A.

### State C: Evaluate

When the learner types an answer:

1. Normalize both target and response:
   - lowercase
   - strip punctuation
   - preserve contractions as one token, e.g. `don't`
   - compare in **order** (this is dictation, not bag-of-words)
2. Run a token-level edit-distance diff and count three operations:
   - `D` (deletions / omissions — target had it, response missed it)
   - `S` (substitutions — wrong word in the right slot)
   - `I` (insertions / extras — response added a word not in target)
3. Compute (WER-style, clamped to 0):
   - `accuracy = max(0, 1 - (D + S + I) / target_tokens)`
   - `raw_score = target_tokens - D - S` (correct tokens, ignoring extras)
   - `max_score = target_tokens`
4. Send feedback and persist in the same evaluation turn.

Feedback message must include:

- Correct full sentence.
- Concise Chinese translation.
- Specific missed words or sounds.
- One short diagnosis of the root cause.

Buttons (layout depends on accuracy):

- If `accuracy < PASS_THRESHOLD` (hold or fail):
  ```json
  [["🔁 再听这句|dict_retry", "🔄 下一句|dict_next"], ["🧭 练习其他|nav:main"]]
  ```
- If `accuracy ≥ PASS_THRESHOLD` (clean pass):
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
  "metadata": "{\"target_weakness\":\"function_word_miss\",\"i_plus_one_dimension\":\"connected_speech\",\"sentence_words\":8,\"tier\":\"intermediate\",\"promotion_credit_after\":1,\"demotion_credit_after\":0}",
  "errors": "[{\"key\":\"function_word_miss\",\"category\":\"listening\",\"severity\":\"medium\",\"original\":\"\",\"correction\":\"to\",\"note\":\"Missed weak function word in connected speech.\"}]",
  "subcap_scores": "[{\"key\":\"listening.detail_accuracy\",\"score\":6.75,\"evidence\":\"6 of 8 tokens correct.\"},{\"key\":\"listening.connected_speech\",\"score\":5.0,\"evidence\":\"Missed weak form and boundary.\"}]"
}
```

`prompt_hash` = first 16 hex chars of `SHA-1(normalized prompt)`; normalize = lowercase + strip punctuation + collapse whitespace. Read dedup window via `recent_practice.recent_prompt_hashes` (§1).

**`ui_feedback` mandatory if any button was tapped**, even on `accuracy=1.0` — otherwise "passed only after slow-down" gets over-promoted.

Abandoned records are written in State B; State D only persists attempted sentences.

Use `response`, never `raw_content`.

### State E: Continue (`dict_next`)

- Re-call `persist action="recent_practice"` (§1) — source of truth for credits + dedup. Do not reconstruct from chat memory.
- Apply §2.3 (skip `redo_count > 0` rows) to decide tier+length before generating.
- Skip `coach_context` re-call unless tier changed.
- Generate next sentence (State A step 2 — incl. dedup check).

### State F: Retry the same sentence (`dict_retry`)

Triggered when the retry button is shown (previous round was hold/fail). Consolidation, not a new probe — bypass tier/length recompute.

1. **Recover the parent sample.** Call `persist action="recent_practice"` with `limit=1, skill_type="listening.dictation"` and grab `id`, `prompt`, `prompt_hash`, `audio_path`. Don't trust chat memory.
2. **Replay the same audio.** Re-send the existing `audio_path` via `tg_msg(type="voice")`. Do not re-call `tts`. (If `audio_path` is missing, fall back to a fresh `tts` on the same `prompt` at standard 100% speed.)
3. **Resend the instruction keyboard.** Same text + same `dict_slow` / `dict_easier` buttons as State A.
4. **Initialize a fresh `ui_feedback` accumulator** for this retry round.
5. **Wait** for the user's typed answer.
6. **On answer:** run State C scoring, then persist via State D **with these overrides**:
   - `parent_sample_id` = parent row's `id`
   - `redo_count` = parent's `redo_count + 1`
   - `prompt_hash` = parent's `prompt_hash` (intentional collision — same item)
   - `prompt` = parent's `prompt`
   - `audio_path` = parent's `audio_path` (or fresh fallback)
   - `metadata` includes `"is_redo": true` and `"parent_accuracy": <parent's accuracy>`
7. After persisting, present the same conditional button layout from State C.

## 4. Collaborates With

- `planner`: routes the learner here when listening/detail/connected-speech is the highest-value next drill.
- `learner-state`: reads persisted evidence later, computes long-running listening state, updates `MEMORY.md`, and writes progress snapshots.
- `coach`: uses this skill's errors and subcap scores to explain what the learner should do next.
- `vocab-harvest` / `vocab-review`: can later turn repeated missed chunks into review items.
- `support/data-contract`: defines the `persist` write protocol, legal fields, and error/subcap conventions.

## 5. Failure And Fallbacks

- If `tts` fails: send a text error, do not invent an audio path. Offer to try again or return to menu.
- If `persist` fails: still send feedback, then clearly say the practice result was not saved.
- If the learner answers in Chinese or says they cannot type: do not score harshly; either replay slower or step down.
- `<tg-spoiler>` is client-side only — no callback. Do not invent a `spoiler_used` flag, do not condition scoring on whether they peeked.
- If the answer is empty: ask once whether to replay, make easier, or skip. If skipped, write `completed=0`.

## 6. Hard Rules

1. `tts` is only for the practice sentence, not for assistant chatter.
2. Diff every word. Do not hide missed articles, plural endings, function words, or word-boundary errors.
3. Use `persist` for learner reads/writes. No raw DB access.
4. Do not update `MEMORY.md`; `learner-state` owns durable ability state.
