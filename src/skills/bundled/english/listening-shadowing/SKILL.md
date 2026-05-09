---
name: listening-shadowing
description: "Listening Rhythm Shadowing. Trigger when the user wants to practice listening comprehension by repeating short chunks. Focuses on rhythm, chunking, and catching fast speech, NOT isolated pronunciation."
---

# Listening Shadowing

Different from `speaking-shadowing` (phoneme accuracy). Here the goal is to stay with the speaker — decoding speed and rhythm, not isolated phonemes. The signal that drives i+1 is **fluency**, not pronunciation accuracy.

## 1. Inputs

Use this skill when:

- User says: `听力跟读`, `影子跟读`, `跟读`, `shadowing`.
- Callback/System trigger: `listening-shadowing`.

Required context before generating audio:

1. Call `persist` with `{"action":"recent_practice","session_id":"<session>","skill_type":"listening.shadowing","limit":"DEDUP_WINDOW"}`. This returns the last `DEDUP_WINDOW` samples (incl. abandoned) with `accuracy` (= fluency/100), `prompt_hash`, `completed`, `ui_feedback`, decoded `metadata` — the canonical short-term state for credit gating (§2.3) and dedup (§2.4). The flat `recent_prompt_hashes` array is the authoritative dedup window.
2. Call `persist` with `{"action":"coach_context","days":14,"limit":8}` for the longer-window aggregate (subcaps, errors). Treat as the slower-moving signal — only re-call when tier changes.
3. Use `MEMORY.md` / `USER.md` only as fallback prompt context if both calls are unavailable.
4. Do not query `study.db` directly.

## 2. Difficulty Policy

The target is **i+1**: one small stretch above the learner's current successful tempo. Adapt clip length / connected-speech density / accent; never throw a 25-word fast AU clip at someone still struggling with 8-word slow US.

### 2.0 Tunable constants

These are the only knobs in this skill. Every threshold below references one of them — change the constant here, not the prose.

| Constant | Value | Meaning |
| --- | --- | --- |
| `PASS_THRESHOLD` | `0.80` | A round with `accuracy ≥ PASS_THRESHOLD` (= fluency ≥ 80) counts as a pass for credit purposes. |
| `FAIL_THRESHOLD` | `0.55` | Below this is a fail. Wider hold band than dictation because shadowing is noisier — beginners stutter even when they "got it". |
| `STREAK` | `2` | Consecutive passes (or fails) needed to move tier / length. |
| `ACC_WINDOW` | `3` | Sample window for §2.2 recent-accuracy mean. |
| `DEDUP_WINDOW` | `20` | Size of the rolling `prompt_hash` dedup window fetched per session via `recent_practice` (§1). |

**Score normalization (CRITICAL):** `pron_assess` returns `fluency` and pronunciation `accuracy` as 0–100 integers. For this skill, the database `accuracy` column = `fluency / 100` (0..1). The `band_pronunciation` field stores the raw pronunciation accuracy separately for `coach`/`learner-state` later. Why: **this skill measures rhythm**, so fluency is the i+1 signal; phoneme accuracy is secondary and lives in its own column.

### 2.1 Tier table (length & connected-speech density only)

Audio is always rendered at **standard 100% speed**. Slow-down is a per-round reactive tool exposed via the `shadow_slow` button — it is **not** a tier property and does **not** belong here.

| Tier (Listening band) | Clip length | Connected speech | Accent |
| --- | --- | --- | --- |
| Beginner (< 5.0) | 5–8 words, 1 chunk | None / minimal linking | Standard US/UK only |
| Intermediate (5.0–6.0) | 10–15 words, 2 chunks | Natural flow, basic linking (`gonna`, `wanna`) | Standard US/UK only |
| Advanced (≥ 6.5) | 20–30 words, 3+ chunks | Heavy reductions (`shoulda`, `whatcha`), elision | US/UK; non-standard accents (AU, IN) only after the learner is stable inside Advanced |

### 2.2 Recent-accuracy window (the signal that drives adaptation)

"Recent accuracy" (here: rolling fluency mean) is **strictly defined** as:

1. **Primary** — mean `accuracy` over the last `ACC_WINDOW` `completed=1` rows in `recent_practice.rows` (already filtered by `skill_type='listening.shadowing'` and the current `session_id`). Abandoned rows (`completed=0`) are **not** included in the mean but DO count toward `demotion_credit` (one abandoned row = one fail; see §2.3).
2. **Fallback** — if `recent_practice` returned fewer than `ACC_WINDOW` completed rows, use the 14-day mean from `coach_context.summary`.
3. **Cold start (profile present)** — if neither sample source is available but `MEMORY.md` has a declared listening band, treat the learner as one tier below that band and start at the **minimum** length.
4. **Cold start (no profile)** — start at **Beginner tier, 5-word minimum**. Never guess upward.

Single-round swings are ignored. The window is always `ACC_WINDOW`.

### 2.3 Credit gating — `promotion_credit` / `demotion_credit`

Track two running counters across the session, computed from `recent_practice.rows` (§1):

- `promotion_credit` — count of consecutive recent rounds with `accuracy ≥ PASS_THRESHOLD`, counting back from the most recent. **Stops** as soon as a fail (`accuracy < FAIL_THRESHOLD` or `completed=0`) is hit; **passes through** hold rounds (`[FAIL_THRESHOLD, PASS_THRESHOLD)`) unchanged. (Holds don't break the credit but only passes increment it — a pure consecutive-pass reading would make promotion nearly impossible since shadowing rarely produces clean 80+ in a row.)
- `demotion_credit` — symmetric: consecutive fails, stopped by any pass; holds pass through. An abandoned row (`completed=0`, written by `shadow_hard`) is treated as one fail.

| Credit | Action |
| --- | --- |
| `promotion_credit ≥ STREAK` at the **current tier ceiling** | Promote to the next tier; reset both credits; start at next tier's minimum length. |
| `promotion_credit ≥ STREAK` **inside** the tier | Stay in tier; bump clip length by **+2 words** (clamped to tier max); reset `promotion_credit`. |
| `demotion_credit ≥ STREAK` at the **current tier floor** | Demote to previous tier; reset both credits; start at previous tier's max length. |
| `demotion_credit ≥ STREAK` **inside** the tier | Stay in tier; drop clip length by **−2 words** (clamped to tier min); reset `demotion_credit`. |
| Hard-button tap (`shadow_hard`) | Persists an abandoned row (State B), which `recent_practice` will surface as a fail next call — no separate counter bookkeeping. |

**Retry rows are skipped from credit counting.** Any row with `redo_count > 0` (written by the implicit re-practice loop in State F) is consolidation evidence, not native-tempo competence. Ignore those rows when walking `recent_practice.rows` for credits; they still count for dedup.

Hold rounds: keep the same length, optionally swap **one** dimension (syntax / connected-speech density / accent) to probe a different weakness from `coach_context.summary.errors`.

### 2.4 Generation rules

- Pick **one target weakness** from `coach_context.summary.errors` or `coach_context.summary.subcaps` (e.g. `function_word_miss`, `listening.connected_speech`).
- Each new clip may stretch **at most one** dimension beyond the previous: length, syntax, accent, or connected-speech density. Never combine two stretches.
- Do **not** repeat a clip whose `prompt_hash` already appears in `recent_practice.recent_prompt_hashes`.
- Do not repeat the same speech-act register (e.g., monologue vs. dialogue snippet) for more than 2 consecutive rounds.

## 3. Flow

### State A: Prepare And Deliver

1. Decide tier and clip length from §2.3. Generate one natural English passage at the chosen length / syntax / accent. Compute its `prompt_hash` and reject if it appears in `recent_practice.recent_prompt_hashes`; regenerate.
2. Use `tts` only for the target passage at standard 100% speed. Do not synthesize conversational filler.
3. **Send audio FIRST**: `tg_msg(type="voice")` — the voice message MUST be sent and confirmed **before** the instruction message. Do NOT send them in parallel.
4. **Then send instruction**: `tg_msg(type="keyboard")`:
   - **Text**: `🎧 先盲听一遍，然后直接按住录音，**一边听一边跟我读（影子跟读）**。\n\n如果实在跟不上，可以点开看原文：<tg-spoiler>{correct English passage}</tg-spoiler>`
   - **Buttons**: `[["🐢 慢速播放|shadow_slow", "😵 太难了，降级|shadow_hard"]]`
5. **Initialize a per-round `ui_feedback` accumulator** (empty string). Every button tap below MUST append the exact button label.
6. **Stop** and wait for the user's voice message or button tap.

### State B: Button Handling (Before recording)

`shadow_slow`:

- **Append `🐢 慢速播放` to the round's `ui_feedback` accumulator** (mandatory — survives into State D's persist call so a "kept up only at slow speed" attempt is not mistaken for native-tempo shadowing).
- Acknowledge with `tg_msg(type="text")`.
- Reuse the same passage; generate slower audio with `tts` at `rate="-10%"`; send the voice + same keyboard. Wait.

`shadow_hard`:

- **STEP 1 — Negative Evidence Lock-in (MANDATORY).** A "drop the level" tap on a shadowing clip is exactly the signal `learner-state` needs to lower the listening tempo target; it MUST hit the database before being replaced. Persist the abandoned record:

  ```json
  {
    "action": "practice",
    "skill_type": "listening.shadowing",
    "session_id": "<session>",
    "completed": 0,
    "accuracy": 0,
    "prompt": "<the original passage that was abandoned>",
    "prompt_hash": "<sha1(normalized prompt) first 16 chars>",
    "response": "",
    "feedback": "Learner tapped '太难了，降级' before recording. Treat as negative evidence at the current tier.",
    "audio_path": "<tts file path of the abandoned audio>",
    "ui_feedback": "😵 太难了，降级",
    "section": "listening",
    "domain": "listening",
    "load_score": 0,
    "minutes": 0,
    "mode": "study",
    "metadata": "{\"abandoned_reason\":\"too_hard\",\"tier\":\"<beginner|intermediate|advanced>\",\"clip_words\":<n>}"
  }
  ```

  After `persist` returns, **reset the round** — start a fresh `ui_feedback` accumulator.

- **STEP 2 — Replacement.** Apply the demotion / length-down rule from §2.3 (the abandoned row will surface as one fail in the next `recent_practice` call). Acknowledge via `tg_msg(type="text")`, generate a new simpler clip, and return to State A.

### State C: Evaluate

When the user sends their voice message:

1. **Run `pron_assess`** with the user's `audio_path` and the `reference_text` of the passage. This returns 4 scores (all 0–100): `accuracy`, `fluency`, `completeness`, `prosody`.
2. Map for the database:
   - `accuracy = fluency / 100` (this is what credit gating reads)
   - `raw_score = fluency`
   - `max_score = 100`
   - `band_pronunciation = <raw pron accuracy>` (kept separate; not used for tier decisions)
3. Identify 1–2 specific places where native speakers link words (连读/吞音) that the user missed or stumbled on — this drives the `errors` / `subcap_scores` arrays.
4. Send feedback and persist in the same evaluation turn.

**Feedback template (MANDATORY format, all labels in Chinese):**

```
📊 跟读报告：
🎯 准确度 <accuracy> | 流利度 <fluency> | 完整度 <completeness> | 韵律 <prosody>

原文：<correct English passage>
翻译：<Chinese translation>

<1-2 sentence Chinese diagnosis focusing on rhythm/connected-speech>
```

**Button logic (tiered by fluency score):**

- If `fluency < 60` (too low — forced re-practice, NO buttons):
  - Append to the feedback: "这句还没跟上节奏哦，再听几遍原音找找感觉，然后直接录音发给我！💪"
  - Do NOT show any buttons. Wait for the user to send another voice message.
  - On the next voice message, re-evaluate as State C (implicit retry loop until fluency ≥ 60).

- If `fluency ≥ 60 AND fluency < 80` (hold zone — show buttons with encouragement):
  ```json
  [["🔄 再来一句|shadow_next", "🧭 练习其他|nav:main"]]
  ```
  Append: "不急，可以再听一遍找找感觉，或者继续下一句。"

- If `fluency ≥ 80` (pass):
  ```json
  [["🔄 再来一句|shadow_next", "🧭 练习其他|nav:main"]]
  ```

### State D: Persist Evidence

Call `persist` with `action="practice"` (or omit `action`) **in parallel** with the State C feedback `tg_msg`.

Minimum payload:

```json
{
  "skill_type": "listening.shadowing",
  "session_id": "<session>",
  "prompt": "<correct passage>",
  "prompt_hash": "<sha1(normalized prompt) first 16 chars>",
  "response": "<transcription from pron_assess>",
  "accuracy": 0.78,
  "raw_score": 78,
  "max_score": 100,
  "band_pronunciation": 84,
  "feedback": "<IN ENGLISH: fluency / rhythm verdict + 1-2 connected-speech moments>",
  "audio_path": "<tts file path>",
  "section": "listening",
  "domain": "listening",
  "load_score": 2,
  "minutes": 1,
  "ui_feedback": "<comma-joined exact labels of every button tapped this round, e.g. '🐢 慢速播放' — empty if no button tapped>",
  "metadata": "{\"tier\":\"intermediate\",\"clip_words\":12,\"promotion_credit_after\":1,\"demotion_credit_after\":0}",
  "subcap_scores": "[{\"key\":\"listening.connected_speech\",\"score\":6.0,\"evidence\":\"Stumbled on the 'gonna' linking and the schwa in 'to'.\"}]"
}
```

**`prompt_hash` (mandatory)** — first 16 hex chars of SHA-1 over the normalized prompt (lowercased, punctuation stripped, whitespace collapsed). Dedup window is **read** via `recent_practice.recent_prompt_hashes` (§1), not stored as a redundant `metadata` field.

**`ui_feedback` is mandatory whenever any 🐢/😵 button was tapped this round**, even if `pron_assess` returns fluency ≥ 80. Without it, `learner-state` will treat a "kept up only at slow speed" pass as native-tempo competence and over-promote.

Abandoned-on-too-hard records are written by State B (`shadow_hard`) — do not duplicate them here. State D only persists fully-attempted clips (with or without slow-down).

### State E: Continue (`shadow_next`)

- Re-call `persist action="recent_practice"` (§1) — this is **the** source of truth for `promotion_credit` / `demotion_credit` and dedup. Do not reconstruct from chat memory.
- Apply the §2.3 rules (skipping `redo_count > 0` rows for credit purposes) to decide the next round's tier and clip length **before** generating.
- Skip the `coach_context` re-call unless the just-applied rule changed tier.
- Generate the next clip (State A step 1, including the `recent_prompt_hashes` dedup check).

### State F: Implicit re-practice (fluency < 60 loop)

When a user sends another voice message after a `fluency < 60` evaluation (no buttons were shown), treat it as a consolidation retry on the **same passage**:

1. **Reuse the same `prompt`, `prompt_hash`, and `audio_path`** from the previous round. Do not generate a new passage.
2. Run `pron_assess` with the same `reference_text`.
3. Persist via State D **with these overrides**:
   - `parent_sample_id` = previous round's sample `id`
   - `redo_count` = previous round's `redo_count + 1`
   - `prompt_hash` = same as previous (intentional collision — same item)
   - `metadata` includes `"is_redo": true` and `"parent_fluency": <previous raw_score>`
4. Apply the same tiered button logic from State C:
   - If still `fluency < 60` → no buttons, prompt to re-practice again.
   - If `fluency ≥ 60` → show `shadow_next` + `nav:main` buttons.

## 4. Hard Rules

1. **No Early Reveals**: never show the English transcript before they attempt the shadowing, except inside `<tg-spoiler>...</tg-spoiler>`.
2. **Score rhythm, not just phonemes**: fluency drives credits; pronunciation accuracy is logged separately in `band_pronunciation` for downstream coaching only.
3. **Audio Mandatory**: you MUST generate TTS audio for every clip. Send voice BEFORE instruction (sequential, not parallel).
4. **Use `persist` for learner reads/writes**. No raw DB access.
5. **Do not update `MEMORY.md`** — `learner-state` owns durable ability state.
6. **Tiered buttons**: fluency < 60 → no buttons (forced re-practice); fluency ≥ 60 → show `shadow_next` + `nav:main` only. Never show a dedicated retry button.
7. **Feedback format**: always use the fixed 4-dimension template (准确度/流利度/完整度/韵律). All labels in Chinese. Do not mix English labels.

