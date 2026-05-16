---
name: listening-dictation
description: "MUST trigger when the user asks for dictation, intensive listening, spelling practice, or mentions they cannot catch fast speech/connected speech. This is the primary strength-training module for listening."
---

# Listening Dictation

Intensive listening drill. One sentence at a time: play audio, let the learner type what they heard, compare token-by-token, persist, then adapt the next sentence by i+1.

## 1. Inputs

Trigger when:

- User says: `听写`, `精听`, `dictation`, `intensive listening`, `听不清连读`, `听不懂快语速`.
- Callback `listening-dictation`.
- Planner routes here for weak `listening.connected_speech`, `listening.detail_accuracy`, `function_word_miss`, plurals, weak forms, numbers, boundaries.

Required context before generating:

1. `persist {"action":"recent_practice","session_id":"<session>","skill_type":"listening.dictation","limit":20}` (`limit` int, not `"DEDUP_WINDOW"` string — `Number()` would NaN it). Returns rows + `recent_prompt_hashes`. Source of truth for §2.3 credit and §2.4 dedup; do not duplicate hashes in `metadata`.
2. `persist {"action":"coach_context","days":14,"limit":8}` for subcaps / errors / due words. Slow signal — only re-call when tier changes.
3. `MEMORY.md` / `USER.md` only as fallback. No raw `study.db` access.

## 2. Difficulty Policy

Target **i+1**: one stretch above the learner's current successful level. Adapt length and syntax to tier; never combine multiple stretches in one round.

### 2.0 Constants & Tier

| Constant | Value | Meaning |
| --- | --- | --- |
| `PASS_THRESHOLD` | `0.80` | A round with `accuracy ≥ PASS` is a pass. |
| `FAIL_THRESHOLD` | `0.60` | Below = fail; `[FAIL, PASS)` = "hold". |
| `STREAK` | `2` | Passes/fails to move length / tier. |
| `ACC_WINDOW` | `3` | Sample window for §2.2 mean. |
| `DEDUP_WINDOW` | `20` | Rolling `prompt_hash` window. |

Standard 100% speed only. Slow-down is the `dict_slow` button (State B), not a tier property.

| Tier (IELTS band ≈ CEFR) | Sentence length | Syntax | Accent |
| --- | --- | --- | --- |
| Beginner (< 5.0 ≈ A1–A2) | 4–7 words, 1 chunk | Simple SVO | Standard US/UK |
| Intermediate (5.0–6.0 ≈ B1) | 8–12 words, 2 chunks | Max 1 subordinate clause | Standard US/UK |
| Advanced (≥ 6.5 ≈ B2+) | 13–20 words, 3+ chunks | Complex syntax, connected-speech | US/UK; non-standard only after stable in Advanced |

**Reading the learner's level from `MEMORY.md`** (do NOT confuse capability score 0–100 with IELTS band 0–9):

1. Prefer `Band Snapshot.Listening` (CEFR string like `A2+`, `B1`, `B2`). Map: `A1`/`A2` → Beginner, `B1` → Intermediate, `B2`/`C1`/`C2` → Advanced.
2. Boundary suffix (`A2+`, `B1-`, `A2+ → B1 boundary`): **降一级起步** (start one tier below the higher side). E.g. `A2+` → Beginner, `B1-` → Beginner, `A2+ → B1 boundary` → Beginner.
3. If CEFR missing, fall back to `Weak Spots.Listening` sub-cap scores (these ARE IELTS-band-shaped, 0–10): take the **lowest** of `function_word_perception` / `detail_accuracy` / `connected_speech` and use the tier table above.
4. **Never** read `Core Capabilities.Listening: <n>/100` as the IELTS band — that's a 0–100 capability score, unrelated to tier mapping.

### 2.2 Recent-accuracy

Mean `accuracy` over last `ACC_WINDOW` `completed=1` rows of current `session_id` + `skill_type`. Abandoned (`completed=0`) excluded from mean but count as fail for `demotion_credit`.

Fallback chain when fewer than `ACC_WINDOW` rows: 14-day mean from `coach_context.summary` → `MEMORY.md` band − 1 tier at min length → Beginner min (4 words). Never guess upward.

### 2.3 Credit gating

```
promotion_credit = walk recent_practice.rows newest→oldest (skip redo_count>0):
  count consecutive accuracy ≥ PASS; reset on any fail (< FAIL or completed=0); holds ([FAIL, PASS)) pass through.
demotion_credit = mirror: count consecutive fail; reset on any pass; holds pass through.
abandoned (completed=0) = 1 fail.
```

| Credit | Action |
| --- | --- |
| `promotion_credit ≥ STREAK` at tier ceiling (length = max) | Promote tier; reset both credits; start at next tier's min length. |
| `promotion_credit ≥ STREAK` inside tier (length < max) | Length **+1**; reset `promotion_credit`. |
| `demotion_credit ≥ STREAK` at tier floor (length = min) | Demote tier; reset both credits; start at prev tier's max. |
| `demotion_credit ≥ STREAK` inside tier (length > min) | Length **−1**; reset `demotion_credit`. |
| `dict_easier` tap | Persists abandoned row (State B); surfaces as fail next call. |

Retry rows (`redo_count > 0`) skipped from credit; still count for dedup.

Hold: keep length, optionally swap **one** dimension (syntax/accent/connected-speech) to probe a weakness from `coach_context.summary.errors`.

### 2.4 Generation

- Pick **one** target weakness from `coach_context.summary.errors|subcaps`.
- Stretch **at most one** dimension per round: length, syntax, accent, connected-speech.
- Reject any sentence whose `prompt_hash` ∈ `recent_practice.recent_prompt_hashes`.
- Don't repeat the same syntactic pattern for 2+ consecutive rounds.

## 3. Flow

### State A: Prepare And Deliver

1. From `coach_context` + §2.3 credits, decide: tier, length, target weakness, i+1 stretch dimension (or hold), expected subcaps.
2. Generate the sentence at chosen length/syntax/accent. Compute `prompt_hash` (§State D); regenerate if dedup hits.
3. `tts` only for the target sentence at 100% speed. No filler audio.
4. Send voice + instruction + buttons in **one** `tg_msg type="render"` call. Renders as two bubbles (voice on its own line, then text + buttons) for clean cross-client display — still one tool call.
5. Init empty `ui_feedback` accumulator; every button tap appends its exact label.

Render envelope (all fields at top level, same as `voice`/`keyboard`):

```json
{
  "type": "render",
  "url": "<tts audio path>",
  "text": "来，听听这一句。把你听到的英文打出来。\n\n实在听不出可以点开看原文：||{correct English sentence}||",
  "buttons": "[[\"🐢 慢速播放|dict_slow\", \"😵 太难了，换简单点|dict_easier\"]]"
}
```

(`||...||` is the Telegram-spoiler shorthand; the adapter expands it to `<tg-spoiler>` HTML. Optional `react: "<emoji>"` reacts the user's last message in the same call.)

Wait for the typed answer or button tap.

### State B: Button Handling

`dict_slow`:

- Append `🐢 慢速播放` to `ui_feedback`.
- Brief ack via `tg_msg type="render"` (text only).
- Same sentence; `tts rate="-10%"`.
- Re-deliver via one `tg_msg type="render"` (same envelope as State A — slower audio path, same text + buttons).

`dict_easier`:

1. **Persist abandoned record FIRST** (before generating the replacement). Same envelope as State D, with these differences:

   ```
   completed=0, accuracy=0, response="",
   feedback="Learner tapped '😵 太难了，换简单点' before answering. Treat as negative evidence at this difficulty/dimension.",
   ui_feedback="😵 太难了，换简单点", load_score=0, minutes=0,
   metadata={"abandoned_reason":"too_hard","sentence_words":<n>,"i_plus_one_dimension":"<dim>"}
   ```

   After `persist` returns, reset `ui_feedback`.

2. **Replacement.** Apply demotion/length-down (§2.3). Show the previous sentence inside `<tg-spoiler>`. One short note explaining why it was hard. Generate a new simpler sentence → State A.

### State C: Evaluate

When the learner types an answer:

1. Normalize both: lowercase, strip punctuation, contractions stay one token (`don't`), compare in **order**.
2. Token-level edit distance:
   - `D` = deletions (target had it, response missed it)
   - `S` = substitutions (wrong word, right slot)
   - `I` = insertions (extra word in response)
3. Compute (clamped to 0):
   - `accuracy = max(0, 1 - (D + S + I) / target_tokens)`
   - `raw_score = target_tokens - D - S`
   - `max_score = target_tokens`
4. **Persist FIRST, THEN feedback**. Sequential — the row must be in DB before feedback reaches the learner.

Write the feedback as a natural short Chinese message — no fixed header, no ✅/❌/💡 template. Every reply MUST cover, in some natural form:

- the correct English sentence
- a 1-line Chinese translation (skip only if the English is trivial like a greeting)
- the **specific** word(s) missed/mistaken — name them ("missed `of`", "wrote `lastest` for `latest`")
- one-phrase root cause when there were errors (weak form / linking / vowel / boundary / number trap)

Two to four sentences usually enough.

Buttons (always, regardless of accuracy):

```json
[["🔄 再来一句|dict_next", "🧭 练习其他|nav:main"]]
```

**Critical**: feedback + buttons in **one** `tg_msg type="render"` call (no `url` — feedback has no media). On **perfect** (`accuracy === 1.0`) add `react: "🔥"` to the same call — Telegram reacts the learner's message, no extra tool call. Voice is replayable from chat history, so no dedicated retry button. (See Hard Rule 5.)

### State D: Persist Evidence

Call `persist` with `action="practice"` (or omit `action`).

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
  "feedback": "<IN ENGLISH for DB / learner-state — the user-facing UI uses the Chinese feedback in §3 State C> The learner missed the weak form 'to' and substituted 'software' with 'soft wear'. This suggests weak word-boundary parsing under connected speech, while the main sentence frame was understood.",
  "audio_path": "<tts file path>",
  "section": "listening",
  "domain": "listening",
  "load_score": 1,
  "minutes": 1,
  "mode": "study",
  "ui_feedback": "<comma-joined exact button labels tapped this round, e.g. '🐢 慢速播放' — empty if none>",
  "metadata": "{\"target_weakness\":\"function_word_miss\",\"i_plus_one_dimension\":\"connected_speech\",\"sentence_words\":8,\"tier\":\"intermediate\",\"promotion_credit_after\":1,\"demotion_credit_after\":0}",
  "errors": "[{\"key\":\"function_word_miss\",\"category\":\"listening\",\"severity\":\"medium\",\"original\":\"\",\"correction\":\"to\",\"note\":\"Missed weak function word in connected speech.\"}]",
  "subcap_scores": "[{\"key\":\"listening.detail_accuracy\",\"score\":6.75,\"evidence\":\"6 of 8 tokens correct.\"},{\"key\":\"listening.connected_speech\",\"score\":5.0,\"evidence\":\"Missed weak form and boundary.\"}]"
}
```

`prompt_hash` = first 16 hex chars of `SHA-1(normalized prompt)`; normalize = lowercase + strip punctuation + collapse whitespace. Read dedup window via `recent_practice.recent_prompt_hashes` (§1).

`ui_feedback` mandatory if any button was tapped, even on `accuracy=1.0`.

State D persists attempted sentences only. Abandoned rows are written in State B. Use `response`, never `raw_content`.

### State E: Continue (`dict_next`)

- Re-call `persist action="recent_practice"` (§1) for credits + dedup. Don't reconstruct from chat memory.
- Apply §2.3 (skip `redo_count > 0`) before generating.
- **NEVER re-call `coach_context` within the same skill session.** It is cached server-side (5-min TTL) and expensive. Only `recent_practice` needs re-reading for credits / dedup.
- Generate next sentence (State A step 2 — incl. dedup).

## 4. Collaborates With

- `planner`: routes here when listening/detail/connected-speech is the highest-value drill.
- `learner-state`: reads persisted evidence, computes long-running listening state, updates `MEMORY.md`.
- `planner`: (proactive nudge) uses errors/subcap scores to explain next steps.
- `vocab-harvest` / `vocab-review`: turn repeated missed chunks into review items.
- `support/data-contract`: defines the `persist` write protocol.

## 5. Failure And Fallbacks

- `tts` fails → text error, no fake `audio_path`. Offer retry / menu.
- `persist` fails → still send feedback, but say it was not saved.
- Learner answers in Chinese / can't type → don't score harshly; replay slower or step down.
- `<tg-spoiler>` is client-side; no callback. Don't invent `spoiler_used`.
- Empty answer → ask once: replay / easier / skip. If skipped, write `completed=0`.

## 6. Hard Rules

1. `tts` only for the practice sentence — no assistant chatter.
2. Diff every word. Don't hide missed articles, plurals, function words, boundaries.
3. Use `persist` for reads/writes; no raw DB.
4. Don't update `MEMORY.md`; `learner-state` owns durable ability state.
5. **All Telegram sends go through `tg_msg type="render"`.** Voice + text + buttons + perfect-score `react: "🔥"` (when `accuracy === 1.0`) all fold into one render call. Never split into separate `voice` / `keyboard` / `text` / `react` / `edit` calls.
6. **Feedback content (not format) required.** State C must always cover: correct sentence, brief translation, specific missed/mistaken words, one-phrase root cause. Format is the LLM's call — no fixed template.
