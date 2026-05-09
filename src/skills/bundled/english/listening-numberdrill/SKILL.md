---
name: listening-numberdrill
description: "Drill numbers, dates, times, and spelling. Trigger for number, spelling, or listening-numberdrill."
---

# Listening NumberDrill

Tiny drill, disproportionate payoff. Targets Section 1 "easy marks" (13 vs 30, double-0, spelling). One sentence at a time: pick a trap, play audio, let the learner type, score the trap, persist evidence, then adapt density / nesting by i+1.

## 1. Inputs

Use this skill when:

- User says: `数字`, `日期`, `拼写`, `number`, `spelling`.
- Callback/System trigger: `listening-numberdrill`.
- Diagnostic trigger: recent `number_confusion` or `spelling_error` patterns.

Required context before generating audio:

1. Call `persist` with `{"action":"recent_practice","session_id":"<session>","skill_type":"listening.numberdrill","limit":"DEDUP_WINDOW"}`. This returns the last `DEDUP_WINDOW` samples (incl. abandoned) with `accuracy`, `prompt_hash`, `completed`, `ui_feedback`, decoded `metadata` — the canonical short-term state for credit gating (§2.3) and dedup (§2.4). The flat `recent_prompt_hashes` array is the authoritative dedup window.
2. Call `persist` with `{"action":"coach_context","days":14,"limit":8}` for the longer-window aggregate (recurring trap categories from `error_patterns`, due tasks). Treat as the slower-moving signal — only re-call when tier changes.
3. Use `MEMORY.md` / `USER.md` only as fallback prompt context if both calls are unavailable.
4. Do not query `study.db` directly.

## 2. Difficulty Policy

The target is **i+1**: one small stretch above the learner's current successful level. Adapt trap density and nesting; never throw a triple-stacked trap at someone still missing simple "13 vs 30".

### 2.0 Tunable constants

These are the only knobs in this skill. Every threshold below references one of them — change the constant here, not the prose.

| Constant | Value | Meaning |
| --- | --- | --- |
| `PASS_THRESHOLD` | `0.80` | A round with `accuracy ≥ PASS_THRESHOLD` counts as a pass for credit purposes. |
| `FAIL_THRESHOLD` | `0.60` | A round with `accuracy < FAIL_THRESHOLD` counts as a fail; `[FAIL_THRESHOLD, PASS_THRESHOLD)` is a "hold". |
| `STREAK` | `2` | Consecutive passes (or fails) needed to move trap density / tier. |
| `ACC_WINDOW` | `3` | Sample window for §2.2 recent-accuracy mean. |
| `DEDUP_WINDOW` | `20` | Size of the rolling `prompt_hash` dedup window fetched per session via `recent_practice` (§1). |

### 2.1 Tier table (trap density, not sentence length)

Audio is always rendered at **standard 100% speed**. Slow-down is a per-round reactive tool exposed via the `num_slow` button — it is **not** a tier property. Default voice is British (`en-GB-SoniaNeural` or `en-GB-RyanNeural`) since the IELTS Section-1 traps are GB-shaped.

| Tier (Listening band) | Trap density | Sentence shape | Accent |
| --- | --- | --- | --- |
| Beginner (< 5.0) | **1 trap, isolated** (e.g., a phone number or a name spelled out) | 6–10 words, no distractors | en-GB only |
| Intermediate (5.0–6.0) | **1 trap with light context** (e.g., a price embedded in a booking) | 10–15 words, one context distractor | en-GB only |
| Advanced (≥ 6.5) | **2+ traps interleaved** (e.g., date + price + room number) | 15–25 words, faster tempo | en-GB or en-US |

### 2.2 Recent-accuracy window (the signal that drives adaptation)

"Recent accuracy" is **strictly defined** as:

1. **Primary** — mean `accuracy` over the last `ACC_WINDOW` `completed=1` rows in `recent_practice.rows` (already filtered by `skill_type='listening.numberdrill'` and the current `session_id`). Abandoned rows (`completed=0`) are **not** included in the mean but DO count toward `demotion_credit` (one abandoned row = one fail; see §2.3).
2. **Fallback** — if `recent_practice` returned fewer than `ACC_WINDOW` completed rows, use the 14-day `number_confusion` / `spelling_error` rate from `coach_context.summary.errors`.
3. **Cold start (profile present)** — if neither sample source is available but `MEMORY.md` has a declared listening band, treat the learner as one tier below that band and start at the **lowest-density** trap.
4. **Cold start (no profile)** — if even the listening band is missing, start at **Beginner tier, single isolated trap**. Never guess upward.

Single-sample swings are ignored. The window is always `ACC_WINDOW`.

### 2.3 Credit gating — `promotion_credit` / `demotion_credit`

Track two running counters across the session, computed from `recent_practice.rows` (§1):

- `promotion_credit` — count of consecutive recent rounds with `accuracy ≥ PASS_THRESHOLD`, counting back from the most recent. **Stops counting** as soon as a fail round (`accuracy < FAIL_THRESHOLD` or `completed=0`) is hit; **passes through** hold rounds unchanged. (Naming: `*_credit` not `*_streak` because holds don't break the credit, but only passes increment it. A pure consecutive-pass reading would make promotion nearly impossible.)
- `demotion_credit` — symmetric: count of consecutive recent fail rounds, stopped by any pass; holds pass through. An abandoned row (`completed=0`, written by `num_hard`) is treated as one fail.

| Credit | Action |
| --- | --- |
| `promotion_credit ≥ STREAK` at the **current tier ceiling** | Promote to the next tier; reset both credits. |
| `promotion_credit ≥ STREAK` **inside** the tier | Stay in tier; nudge **one** dimension up (length +2 words OR add one distractor OR add a second trap if Beginner→Intermediate already done); reset `promotion_credit`. |
| `demotion_credit ≥ STREAK` at the **current tier floor** | Demote to previous tier; reset both credits. |
| `demotion_credit ≥ STREAK` **inside** the tier | Stay in tier; nudge **one** dimension down (length −2 words OR drop the distractor); reset `demotion_credit`. |
| Hard-button tap (`num_hard`) | Persists an abandoned row (State B), which `recent_practice` will surface as a fail next call — no separate counter bookkeeping. |

**Retry rows are skipped from credit counting.** Any row with `redo_count > 0` (written by `num_retry`, see State F) is consolidation evidence, not native-tempo competence. Ignore those rows when walking `recent_practice.rows` for credits; they still count for dedup.

Hold rounds: keep the same density, optionally swap **one** trap category (e.g., from teen-vs-ty to date format) to probe a different weakness from `coach_context.summary.errors`.

### 2.4 Generation rules

- Pick **one trap category** per sentence — see §3. Never stack two from the same category in a single sentence.
- For Advanced rounds, the 2+ traps must be from **different** categories (e.g., date + currency, not two phone numbers).
- Each new sentence may stretch **at most one** dimension beyond the previous: density, nesting, length, or accent. Never combine two stretches.
- Do **not** repeat a sentence whose `prompt_hash` already appears in `recent_practice.recent_prompt_hashes`.
- Do not reuse the same trap category for more than 2 consecutive rounds.

## 3. Trap categories (pick ONE per sentence)

- **Teen vs Ty** (13/30, 14/40, 15/50 — stress contrast)
- **Phone / Account** ("double-0", "triple-7", "oh" for 0)
- **Dates / Times** (GB vs US format, "quarter past", "half past")
- **Currencies / Decimals** ("point", pounds, dollars, "p" for pence)
- **Name Spellings** (double letters, confusing vowels A/E/I, EN-vs-AN endings)

## 4. Flow

### State A: Prepare And Deliver

1. Decide tier and trap category from §2.3 + §2.4. Generate one natural English sentence containing the chosen trap. Compute its `prompt_hash` and reject if it appears in `recent_practice.recent_prompt_hashes`; regenerate.
2. Use `tts` only for the target sentence at standard 100% speed, default GB voice. Do not synthesize conversational filler. Send via `tg_msg(type="voice")`.
3. Send the instruction with `tg_msg(type="keyboard")`:
   - **Text**: `🎧 听录音，把听到的**数字、时间、或拼写的单词**打出来。\n\n实在听不出可以点开看原文：<tg-spoiler>{correct English sentence}</tg-spoiler>`
   - **Buttons**: `[["🐢 慢速播放|num_slow", "😵 太难了，换简单点|num_hard"]]`
4. **Initialize a per-round `ui_feedback` accumulator** (empty string). Every button tap below MUST append the exact button label.
5. **Stop** and wait for the user's typed answer or button tap.

### State B: Button Handling

`num_slow`:

- **Append `🐢 慢速播放` to the round's `ui_feedback` accumulator** (mandatory — survives into State D's persist call so a "passed only after slow-down" attempt is not mistaken for clean comprehension).
- Acknowledge with `tg_msg(type="text")`.
- Reuse the same sentence; generate slower audio with `tts` at `rate="-10%"`; send the voice + same keyboard. Wait.

`num_hard`:

- **STEP 1 — Negative Evidence Lock-in (MANDATORY).** Persist the abandoned record before anything else:

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

  After `persist` returns, **reset the round** — start a fresh `ui_feedback` accumulator.

- **STEP 2 — Replacement.** Apply the demotion / nudge-down rule from §2.3 (the abandoned row will surface as one fail in the next `recent_practice` call). Acknowledge naturally via `tg_msg(type="text")`, briefly explain the trap, generate a new simpler sentence, and return to State A. The abandoned `prompt_hash` is now in the database and will be excluded automatically.

### State C: Evaluate

When the learner types an answer:

1. Normalize both target and response (lowercase, strip punctuation, preserve digit groupings, compare in order).
2. Run a token-level edit-distance diff and count `D` (deletions), `S` (substitutions), `I` (insertions).
3. Compute (WER-style, clamped to 0):
   - `accuracy = max(0, 1 - (D + S + I) / target_tokens)`
   - `raw_score = target_tokens - D - S`
   - `max_score = target_tokens`
4. Identify **specifically** how the trap was missed (e.g., `13` written as `30`, missed "double", misspelled vowel) — this drives the `errors` array, not the overall accuracy.
5. Send feedback and persist in the same evaluation turn.

Feedback message must include:

- Correct full sentence + concise Chinese translation.
- **Specific trap diagnosis** (e.g., "thirty 的重音在前面，thirteen 在后面").

Buttons (layout depends on accuracy):

- If `accuracy < PASS_THRESHOLD`:
  ```json
  [["🔁 再听这句|num_retry", "🔄 下一个|num_next"], ["🧭 练习其他|nav:main"]]
  ```
- If `accuracy ≥ PASS_THRESHOLD`:
  ```json
  [["🔄 再来一个|num_next", "🧭 练习其他|nav:main"]]
  ```

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

**`prompt_hash` (mandatory)** — first 16 hex chars of SHA-1 over the normalized prompt (lowercased, punctuation stripped, whitespace collapsed). Dedup window is **read** via `recent_practice.recent_prompt_hashes` (§1), not stored as a redundant `metadata` field.

**`ui_feedback` is mandatory whenever any 🐢/😵 button was tapped this round**, even if the final `accuracy` is 1.0. Without it, `learner-state` cannot tell apart a confident pass from a "passed only after slow-down" pass and may over-promote.

Abandoned-on-too-hard records are written by State B (`num_hard`) — do not duplicate them here. State D only persists fully-attempted sentences (with or without slow-down).

### State E: Continue (`num_next`)

- Re-call `persist action="recent_practice"` (§1) — this is **the** source of truth for `promotion_credit` / `demotion_credit` and dedup. Do not reconstruct from chat memory.
- Apply the §2.3 rules (skipping `redo_count > 0` rows for credit purposes) to decide the next round's tier and trap density **before** generating.
- Skip the `coach_context` re-call unless the just-applied rule changed tier.
- Generate the next sentence (State A step 1, including the `recent_prompt_hashes` dedup check). Pick a trap category that respects the "no more than 2 consecutive same category" rule from §2.4.

### State F: Retry the same sentence (`num_retry`)

Triggered by the conditional retry button (only shown when the previous attempt was a hold or fail). Intent: **consolidation at the same difficulty**, not a new probe — bypass tier/density recomputation.

1. **Recover the parent sample.** Call `persist action="recent_practice"` with `limit=1, skill_type="listening.numberdrill"` and grab the most recent row's `id`, `prompt`, `prompt_hash`, `audio_path`. Don't trust chat memory — a session compaction could have wiped them.
2. **Replay the same audio.** Re-send the existing `audio_path` via `tg_msg(type="voice")`. **Do not re-call `tts`**. (If `audio_path` is missing, fall back to a fresh `tts` on the same `prompt` at standard 100% speed.)
3. **Resend the instruction keyboard** (same text + same `num_slow` / `num_hard` buttons as State A — slow-down and abandon are still on the table during retry).
4. **Initialize a fresh `ui_feedback` accumulator** for this retry round.
5. **Wait** for the typed answer.
6. **On answer:** run State C scoring, then persist via State D **with these overrides**:
   - `parent_sample_id` = parent row's `id`
   - `redo_count` = parent's `redo_count + 1`
   - `prompt_hash` = parent's `prompt_hash` (intentional collision — same item)
   - `prompt` = parent's `prompt`
   - `audio_path` = parent's `audio_path` (or fresh fallback)
   - `metadata` includes `"is_redo": true` and `"parent_accuracy": <parent accuracy>`
7. After persisting, present the same conditional button layout from State C.

## 5. Hard Rules

1. **No Early Reveals**: never show the English transcript on the first listen except inside `<tg-spoiler>...</tg-spoiler>`.
2. **No Conversational TTS**: the `tts` tool is only for the practice sentence.
3. **Use `persist` for learner reads/writes.** No raw DB access.
4. **Do not update `MEMORY.md`** — `learner-state` owns durable ability state.
5. After every evaluated sentence, give next-step buttons.
