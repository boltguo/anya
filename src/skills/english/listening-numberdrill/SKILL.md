---
name: listening-numberdrill
description: "Drill numbers, dates, times, and spelling. Trigger for number, spelling, or listening-numberdrill."
---

# Listening NumberDrill

Tiny drill, disproportionate payoff. Targets Section 1 "easy marks" (13 vs 30, double-0, spelling). One sentence at a time: pick a trap, play audio, let the learner type, score the trap, persist, then adapt density / nesting by i+1.

## 1. Inputs

Trigger when:

- User says: `数字`, `日期`, `拼写`, `number`, `spelling`.
- Callback `listening-numberdrill`.
- Diagnostic trigger: recent `number_confusion` or `spelling_error` patterns.

Required context before generating:

1. `persist {"action":"recent_practice","session_id":"<session>","skill_type":"listening.numberdrill","limit":20}` (`limit` int, not `"DEDUP_WINDOW"` string — `Number()` would NaN it). Returns rows with `accuracy`, `prompt_hash`, `ui_feedback`, decoded `metadata` + flat `recent_prompt_hashes`. Source of truth for §2.3 credit and §2.4 dedup.
2. `persist {"action":"coach_context","days":14,"limit":8}` for recurring trap categories from `error_patterns` / due tasks. Slow signal — only re-call when tier changes.
3. `MEMORY.md` / `USER.md` only as fallback. No raw `study.db` access.

## 2. Difficulty Policy

Target **i+1**: one stretch above the learner's current successful level. Adapt trap density and nesting; never throw a triple-stacked trap at someone still missing simple "13 vs 30".

### 2.0 Constants & Tier

| Constant | Value | Meaning |
| --- | --- | --- |
| `PASS_THRESHOLD` | `0.80` | A round with `accuracy ≥ PASS` is a pass. |
| `FAIL_THRESHOLD` | `0.60` | Below = fail; `[FAIL, PASS)` = "hold". |
| `STREAK` | `2` | Passes/fails to move trap density / tier. |
| `ACC_WINDOW` | `3` | Sample window for §2.2 mean. |
| `DEDUP_WINDOW` | `20` | Rolling `prompt_hash` window. |

Standard 100% speed only. Slow-down is the `num_slow` button (State B), not a tier property. Default voice is British (`en-GB-SoniaNeural` / `en-GB-RyanNeural`) since IELTS Section-1 traps are GB-shaped.

| Tier (IELTS band ≈ CEFR) | Trap density | Sentence shape | Accent |
| --- | --- | --- | --- |
| Beginner (< 5.0 ≈ A1–A2) | **1 trap, isolated** (phone number, name spelled out) | 6–10 words, no distractors | en-GB only |
| Intermediate (5.0–6.0 ≈ B1) | **1 trap with light context** (price embedded in a booking) | 10–15 words, one context distractor | en-GB only |
| Advanced (≥ 6.5 ≈ B2+) | **2+ traps interleaved** (date + price + room number) | 15–25 words, faster tempo | en-GB or en-US |

**Reading the learner's level from `MEMORY.md`** (do NOT confuse capability score 0–100 with IELTS band 0–9):

1. Prefer `Band Snapshot.Listening` (CEFR string). Map: `A1`/`A2` → Beginner, `B1` → Intermediate, `B2`/`C1`/`C2` → Advanced.
2. Boundary suffix (`A2+`, `B1-`, `... → ... boundary`): **降一级起步**. E.g. `A2+` → Beginner.
3. If CEFR missing, fall back to `Weak Spots.Listening` sub-cap scores (0–10): take the **lowest** sub-cap and use the tier table above.
4. **Never** read `Core Capabilities.Listening: <n>/100` as IELTS band — that's a 0–100 capability score.

### 2.2 Recent-accuracy

Mean `accuracy` over last `ACC_WINDOW` `completed=1` rows of current `session_id` + `skill_type`. Abandoned (`completed=0`) excluded from mean but count as fail for `demotion_credit`.

Fallback chain when fewer than `ACC_WINDOW` rows: 14-day `number_confusion` / `spelling_error` rate from `coach_context.summary.errors` → `MEMORY.md` band − 1 tier at lowest density → Beginner single isolated trap. Never guess upward.

### 2.3 Credit gating

```
promotion_credit = walk recent_practice.rows newest→oldest (skip redo_count>0):
  count consecutive accuracy ≥ PASS; reset on any fail (< FAIL or completed=0); holds ([FAIL, PASS)) pass through.
demotion_credit = mirror: count consecutive fail; reset on any pass; holds pass through.
abandoned (completed=0, written by `num_hard`) = 1 fail.
```

| Credit | Action |
| --- | --- |
| `promotion_credit ≥ STREAK` at tier ceiling | Promote tier; reset both credits. |
| `promotion_credit ≥ STREAK` inside tier | Nudge **one** dimension up (length +2 OR add one distractor OR add a second trap once Beginner→Intermediate done); reset `promotion_credit`. |
| `demotion_credit ≥ STREAK` at tier floor | Demote tier; reset both credits. |
| `demotion_credit ≥ STREAK` inside tier | Nudge **one** dimension down (length −2 OR drop the distractor); reset `demotion_credit`. |
| `num_hard` tap | Persists abandoned row (State B); surfaces as fail next call. |

Retry rows (`redo_count > 0`) skipped from credit; still count for dedup.

Hold: keep density, optionally swap **one** trap category (teen-vs-ty → date format) to probe a different weakness from `coach_context.summary.errors`.

### 2.4 Generation

- Pick **one** trap category per sentence (see §3). Never stack two from the same category.
- Advanced rounds: 2+ traps must be from **different** categories (e.g., date + currency, not two phone numbers).
- Stretch **at most one** dimension per round: density, nesting, length, accent.
- Reject any sentence whose `prompt_hash` ∈ `recent_practice.recent_prompt_hashes`.
- Don't reuse the same trap category for 2+ consecutive rounds.

## 3. Trap categories (pick ONE per sentence)

- **Teen vs Ty** (13/30, 14/40, 15/50 — stress contrast)
- **Phone / Account** ("double-0", "triple-7", "oh" for 0)
- **Dates / Times** (GB vs US format, "quarter past", "half past")
- **Currencies / Decimals** ("point", pounds, dollars, "p" for pence)
- **Name Spellings** (double letters, confusing vowels A/E/I, EN-vs-AN endings)

## 4. Flow

### State A: Prepare And Deliver

1. From §2.3 + §2.4, decide tier and trap category. Generate the sentence containing the chosen trap. Compute `prompt_hash` (§State D); regenerate on dedup hit.
2. `tts` only for the target sentence at 100% speed, default GB voice. No filler audio. Send via a separate `tg_msg type="voice"` call with the audio `url`. Wait for delivery.
3. THEN a separate `tg_msg type="keyboard"` call (text + buttons only — **never include `url` here**, the keyboard endpoint has no media slot):
   - Text: `🎧 听录音，把听到的**数字、时间、或拼写的单词**打出来。\n\n实在听不出可以点开看原文：<tg-spoiler>{correct English sentence}</tg-spoiler>`
   - Buttons: `[["🐢 慢速播放|num_slow", "😵 太难了，换简单点|num_hard"]]`
4. Init empty `ui_feedback` accumulator; every button tap appends its exact label.
5. Wait for typed answer or button tap.

### State B: Button Handling

`num_slow`:

- Append `🐢 慢速播放` to `ui_feedback` (mandatory — survives into State D so a "passed only after slow-down" attempt is not mistaken for clean comprehension).
- Brief ack via `tg_msg type="text"`.
- Same sentence; `tts rate="-10%"`; send slower voice + same keyboard. Wait.

`num_hard`:

1. **Persist abandoned record FIRST** (before generating the replacement):

   ```json
   {
     "action": "practice",
     "skill_type": "listening.numberdrill",
     "session_id": "<session>",
     "completed": 0,
     "accuracy": 0,
     "prompt": "<the sentence that was just too hard>",
     "prompt_hash": "<sha1(normalized prompt) first 16 chars>",
     "response": "",
     "feedback": "Learner tapped '太难了' before answering. Trap category was <e.g. teen-vs-ty>; treat as negative evidence at this difficulty.",
     "audio_path": "<tts file path of the abandoned sentence>",
     "ui_feedback": "😵 太难了",
     "section": "listening",
     "domain": "listening",
     "load_score": 0,
     "minutes": 0,
     "mode": "study",
     "metadata": "{\"abandoned_reason\":\"too_hard\",\"trap_category\":\"<category>\",\"tier\":\"<beginner|intermediate|advanced>\"}"
   }
   ```

   After `persist` returns, reset `ui_feedback`.

2. **Replacement.** Apply demotion / nudge-down (§2.3). Brief ack via `tg_msg type="text"`, briefly explain the trap, generate a new simpler sentence → State A.

### State C: Evaluate

When the learner types an answer:

1. **Extract trap target(s)** from the original sentence (the number, date, time, price, or spelling that the trap tests). E.g. for "The booking reference is double zero seven three", the trap target is `0073`.
2. **Primary scoring (accuracy)** — based on trap target match ONLY:
   - Exact match of all trap targets → `1.0`
   - Partial match (got the core digits but missed grouping, e.g. `73` vs `0073`) → `0.8`
   - Close but confused (e.g. `30` instead of `13` — the exact trap they should catch) → `0.4`
   - Completely wrong or missing → `0.0`
3. **Secondary scoring (subcap only)** — full sentence token-level edit distance:
   - Normalize both target and response (lowercase, strip punctuation, preserve digit groupings).
   - Token-level edit distance: `D` (deletions), `S` (substitutions), `I` (insertions).
   - `full_sentence_accuracy = max(0, 1 - (D + S + I) / target_tokens)`
   - Store as `subcap_scores: [{key: "listening.full_transcription", score: <0-10 scaled>, evidence: "..."}]`
   - This does NOT affect tier progression — `accuracy` alone drives credits.
4. Identify **specifically** how the trap was missed (e.g., `13` written as `30`, missed "double", misspelled vowel) — drives the `errors` array.
5. Send feedback and persist in the same evaluation turn.

Feedback message must include:

- Correct full sentence + concise Chinese translation.
- **Specific trap diagnosis** (e.g., "thirty 的重音在前面，thirteen 在后面").

Buttons (always, regardless of accuracy):

```json
[["🔄 再来一个|num_next", "🧭 练习其他|nav:main"]]
```

**Critical**: feedback + buttons in **one** `tg_msg type="keyboard"` call. Never `type="text"` then `type="edit"` — that pattern leaves the message buttonless on the client. Voice is replayable from chat history; the report already shows the correct sentence + trap diagnosis, so a dedicated retry button has no learning value.

### State D: Persist Evidence

Call `persist` with `action="practice"` (or omit `action`).

Minimum payload:

```json
{
  "skill_type": "listening.numberdrill",
  "session_id": "<session>",
  "prompt": "<correct sentence>",
  "prompt_hash": "<sha1(normalized prompt) first 16 chars>",
  "response": "<user's typed text>",
  "accuracy": 0.83,
  "raw_score": 10,
  "max_score": 12,
  "feedback": "<IN ENGLISH: trap-specific diagnosis>",
  "audio_path": "<tts file path>",
  "section": "listening",
  "domain": "listening",
  "load_score": 1,
  "minutes": 1,
  "ui_feedback": "<comma-joined exact labels of every button tapped this round, e.g. '🐢 慢速播放' — empty if no button tapped>",
  "metadata": "{\"trap_category\":\"teen_ty\",\"tier\":\"intermediate\",\"promotion_credit_after\":1,\"demotion_credit_after\":0}",
  "errors": "[{\"key\":\"number_confusion\",\"category\":\"listening\",\"correction\":\"30\",\"note\":\"<IN ENGLISH: note about teen/ty stress confusion>\"}]"
}
```

Error keys: `number_confusion`, `spelling_error`, `function_word_miss`.

`prompt_hash` = first 16 hex chars of `SHA-1(normalized prompt)`; normalize = lowercase + strip punctuation + collapse whitespace. Read dedup window via `recent_practice.recent_prompt_hashes` (§1).

`ui_feedback` mandatory whenever any 🐢/😵 button was tapped, even on `accuracy=1.0`.

State D persists fully-attempted sentences only (with or without slow-down). Abandoned rows are written in State B.

### State E: Continue (`num_next`)

- Re-call `persist action="recent_practice"` (§1) for credits + dedup. Don't reconstruct from chat memory.
- Apply §2.3 (skip `redo_count > 0`) before generating.
- **NEVER re-call `coach_context` within the same skill session.** It is cached server-side (5-min TTL) and expensive. Only `recent_practice` needs re-reading for credits / dedup.
- Generate next sentence (State A step 1 — incl. dedup). Respect "no more than 2 consecutive same trap category" (§2.4).

## 5. Hard Rules

1. **No early reveals**: never show the transcript on first listen except inside `<tg-spoiler>`.
2. `tts` only for the practice sentence — no assistant chatter.
3. Use `persist` for reads/writes; no raw DB.
4. Don't update `MEMORY.md`; `learner-state` owns durable ability state.
5. **One-call keyboard.** Reports + buttons go out in a single `tg_msg type="keyboard"` call. Never `type="text"` followed by `type="edit"` to attach buttons.
