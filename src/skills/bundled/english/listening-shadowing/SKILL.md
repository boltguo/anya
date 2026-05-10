---
name: listening-shadowing
description: "Listening Rhythm Shadowing. Trigger when the user wants to practice listening comprehension by repeating short chunks. Focuses on rhythm, chunking, and catching fast speech, NOT isolated pronunciation."
---

# Listening Shadowing

Different from `speaking-shadowing` (phoneme accuracy). Goal here: stay with the speaker — decoding speed and rhythm. The signal driving i+1 is **fluency**, not pronunciation accuracy.

## 1. Inputs

Trigger when:

- User says: `听力跟读`, `影子跟读`, `跟读`, `shadowing`.
- Callback `listening-shadowing`.
- **Disambiguation**: bare `跟读` defaults here (rhythm). Route to `speaking-shadowing` only on explicit phoneme/发音/口音/怎么读/不会读 — that's a different drill.

Required context before generating:

1. `persist {"action":"recent_practice","session_id":"<session>","skill_type":"listening.shadowing","limit":20}` (`limit` int, not `"DEDUP_WINDOW"` string — `Number()` would NaN it). Returns rows with `accuracy` (= fluency/100), `prompt_hash`, `ui_feedback`, decoded `metadata` + flat `recent_prompt_hashes`. Source of truth for §2.3 credit and §2.4 dedup.
2. `persist {"action":"coach_context","days":14,"limit":8}` for subcaps / errors. Slow signal — only re-call when tier changes.
3. `MEMORY.md` / `USER.md` only as fallback. No raw `study.db` access.

## 2. Difficulty Policy

Target **i+1**: one stretch above the learner's current successful tempo. Adapt clip length / connected-speech density / accent; never combine multiple stretches.

### 2.0 Constants & Tier

| Constant | Value | Meaning |
| --- | --- | --- |
| `PASS_THRESHOLD` | `0.85` | `accuracy ≥ PASS` (= fluency ≥ 85) is a pass. Raised from 0.80 because fluency alone over-promotes attempts that kept rhythm but dropped key words. |
| `FAIL_THRESHOLD` | `0.55` | Below = fail. Wider hold band than dictation — shadowing is noisier; beginners stutter even when they "got it". |
| `STREAK` | `2` | Passes/fails to move tier / length. |
| `ACC_WINDOW` | `3` | Sample window for §2.2 mean. |
| `DEDUP_WINDOW` | `20` | Rolling `prompt_hash` window. |

**Score normalization (CRITICAL):** `pron_assess` returns `fluency` and pronunciation `accuracy` 0–100. DB `accuracy` column = `fluency / 100` (this drives credit gating — rhythm is the i+1 signal). Raw pronunciation goes to `band_pronunciation` separately for `coach`/`learner-state` later; not used for tier decisions.

Standard 100% speed only. Slow-down is the `shadow_slow` button (State B), not a tier property.

| Tier (IELTS band ≈ CEFR) | Clip length | Connected speech | Accent |
| --- | --- | --- | --- |
| Beginner (< 5.0 ≈ A1–A2) | 5–8 words, 1 chunk | None / minimal linking | Standard US/UK |
| Intermediate (5.0–6.0 ≈ B1) | 10–15 words, 2 chunks | Natural flow, basic linking (`gonna`, `wanna`) | Standard US/UK |
| Advanced (≥ 6.5 ≈ B2+) | 20–30 words, 3+ chunks | Heavy reductions (`shoulda`, `whatcha`), elision | US/UK; non-standard only after stable in Advanced |

**Reading the learner's level from `MEMORY.md`** (do NOT confuse capability score 0–100 with IELTS band 0–9):

1. Prefer `Band Snapshot.Listening` (CEFR string). Map: `A1`/`A2` → Beginner, `B1` → Intermediate, `B2`/`C1`/`C2` → Advanced.
2. Boundary suffix (`A2+`, `B1-`, `... → ... boundary`): **降一级起步**. E.g. `A2+` → Beginner.
3. If CEFR missing, fall back to `Weak Spots.Listening` sub-cap scores (0–10): take the **lowest** sub-cap and use the tier table above.
4. **Never** read `Core Capabilities.Listening: <n>/100` as IELTS band — that's a 0–100 capability score.

### 2.2 Recent-accuracy

Mean `accuracy` over last `ACC_WINDOW` `completed=1` rows of current `session_id` + `skill_type`. Abandoned (`completed=0`) excluded from mean but count as fail for `demotion_credit`.

Fallback chain when fewer than `ACC_WINDOW` rows: 14-day mean from `coach_context.summary` → `MEMORY.md` band − 1 tier at min length → Beginner min (5 words). Never guess upward.

### 2.3 Credit gating

```
promotion_credit = walk recent_practice.rows newest→oldest (skip redo_count>0):
  count consecutive accuracy ≥ PASS; reset on any fail (< FAIL or completed=0); holds ([FAIL, PASS)) pass through.
demotion_credit = mirror: count consecutive fail; reset on any pass; holds pass through.
abandoned (completed=0, written by `shadow_hard`) = 1 fail.
```

| Credit | Action |
| --- | --- |
| `promotion_credit ≥ STREAK` at tier ceiling | Promote tier; reset both credits; start at next tier's min length. |
| `promotion_credit ≥ STREAK` inside tier | Length **+2**; reset `promotion_credit`. |
| `demotion_credit ≥ STREAK` at tier floor | Demote tier; reset both credits; start at prev tier's max. |
| `demotion_credit ≥ STREAK` inside tier | Length **−2**; reset `demotion_credit`. |
| `shadow_hard` tap | Persists abandoned row (State B); surfaces as fail next call. |

Retry rows (`redo_count > 0`) skipped from credit; still count for dedup.

Hold: keep length, optionally swap **one** dimension (syntax / connected-speech / accent) to probe a different weakness from `coach_context.summary.errors`.

### 2.4 Generation

- Pick **one** target weakness from `coach_context.summary.errors|subcaps`.
- Stretch **at most one** dimension per round: length, syntax, accent, connected-speech.
- Reject any clip whose `prompt_hash` ∈ `recent_practice.recent_prompt_hashes`.
- Don't repeat the same speech-act register (monologue vs. dialogue) for 2+ consecutive rounds.

## 3. Flow

### State A: Prepare And Deliver

1. From §2.3 credits, decide tier and clip length. Generate the passage at chosen length/syntax/accent. Compute `prompt_hash` (§State D); regenerate on dedup hit.
2. `tts` only for the target passage at 100% speed. No filler audio.
3. Send voice FIRST: a separate `tg_msg type="voice"` call with the audio `url`. Wait for delivery.
4. THEN send instruction: a separate `tg_msg type="keyboard"` call (text + buttons only — **never include `url` here**, the keyboard endpoint has no media slot). Never parallel — see Hard Rule 3.
   - Text: `🎧 先盲听一遍，然后直接按住录音，**一边听一边跟我读（影子跟读）**。\n\n如果实在跟不上，可以点开看原文：<tg-spoiler>{correct English passage}</tg-spoiler>`
   - Buttons: `[["🐢 慢速播放|shadow_slow", "😵 太难了，降级|shadow_hard"]]`
5. Init empty `ui_feedback` accumulator; every button tap appends its exact label.
6. Wait for the user's voice message or button tap.

### State B: Button Handling (before recording)

`shadow_slow`:

- Append `🐢 慢速播放` to `ui_feedback` (mandatory — survives into State D so a "kept up only at slow speed" attempt is not mistaken for native-tempo competence).
- Brief ack via `tg_msg type="text"`.
- Same passage; `tts rate="-10%"`.
- Send slower voice FIRST, THEN re-send instruction keyboard. Never parallel.

`shadow_hard`:

1. **Persist abandoned record FIRST.** A "drop the level" tap is exactly the signal `learner-state` needs to lower the tempo target; it MUST hit the database before being replaced:

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
     "feedback": "Learner tapped '😵 太难了，降级' before recording. Treat as negative evidence at the current tier.",
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

   After `persist` returns, reset the round (fresh `ui_feedback` accumulator).

2. **Replacement.** Apply the demotion / length-down rule from §2.3 (the abandoned row will surface as one fail in the next `recent_practice` call). Brief ack via `tg_msg type="text"`, generate a new simpler clip → State A.

### State C: Evaluate

When the user sends a voice message:

1. Run `pron_assess` with the user's `audio_path` and the passage's `reference_text`. Returns 4 scores 0–100: `accuracy`, `fluency`, `completeness`, `prosody`.
2. Map for DB:
   - `accuracy = fluency / 100` (drives credit gating)
   - `raw_score = fluency`, `max_score = 100`
   - `band_pronunciation = <raw pron accuracy>` (separate; not a tier driver)
3. Identify 1–2 specific places where native speakers link words (连读/吞音) that the user missed/stumbled on — drives `errors` / `subcap_scores`.
4. **Persist FIRST, THEN feedback**. Sequential — State F's parent-sample lookup needs the row in DB before the next voice message arrives.

Feedback content (no fixed header/template) — every reply MUST cover, in some natural form:

- the four `pron_assess` scores. Use the **exact 3-character labels** so the line aligns visually: **准确度 / 流利度 / 完整度 / 韵律感**. Show all four numbers.
- the correct English passage
- a 1-line Chinese translation
- 1–2 sentences naming the **specific 1–2 chunks** that broke rhythm (linking, weak form, chunk boundary)

Two to four sentences after the score line, conversational.

**Buttons (binary by `accuracy` vs `PASS_THRESHOLD`):**

- `accuracy < PASS` (fluency < 85) — forced re-practice, **NO buttons**:
  1. Generate coaching audio (see "Low-score coaching TTS" below); send AFTER feedback text but BEFORE waiting.
  2. Append: `这句还没跟稳节奏哦，先听听这一段示范，再多听几遍原音找找感觉，然后直接录音发给我！💪`
  3. Wait for the next voice message → re-evaluate via State F.
- `accuracy ≥ PASS` (fluency ≥ 85, clean pass): `[["🔄 再来一句|shadow_next", "🧭 练习其他|nav:main"]]`

**Low-score coaching TTS** (mandatory when `accuracy < PASS`):

Goal: a focused, **slow + clear** model for the **specific 1–2 chunks** they stumbled on — not a slow copy of the full sentence (Telegram lets them replay the original).

1. Pick **at most 2** items from this round's `errors[]` — prefer connected-speech / linking / weak-form over isolated phoneme slips (this skill is rhythm-focused).
2. **Use `tts` segments mode** (renders proper SSML `<break time="..."/>` — clean breath gaps, not mumbled ellipses). Per chunk, 3 segments:
   1. Voice: the **isolated phrase** (e.g. `"version of"`, `"gonna"`)
   2. `{"break":"800ms"}`
   3. Voice: a short **sentence fragment** containing the chunk (e.g. `"The latest version of React."`)
3. Every voice segment uses `"rate": "-25%"` (genuinely slow — `-10%` isn't enough; the learner needs every consonant to land). Same `voice` as the original clip.
4. Between two chunks: `{"break":"1500ms"}`.
5. No English narration ("Listen to this linking:") — pure model phrases only; the report text already explains in Chinese.
6. Target length 8–15 seconds at the slow rate.

Example call (one chunk — `version of`):

```json
{
  "segments": "[{\"voice\":\"en-US-AriaNeural\",\"text\":\"version of\",\"rate\":\"-25%\"},{\"break\":\"800ms\"},{\"voice\":\"en-US-AriaNeural\",\"text\":\"The latest version of React.\",\"rate\":\"-25%\"}]"
}
```

Example call (two chunks — `gonna` + `wanna`):

```json
{
  "segments": "[{\"voice\":\"en-US-AriaNeural\",\"text\":\"gonna\",\"rate\":\"-25%\"},{\"break\":\"800ms\"},{\"voice\":\"en-US-AriaNeural\",\"text\":\"I'm gonna call you later.\",\"rate\":\"-25%\"},{\"break\":\"1500ms\"},{\"voice\":\"en-US-AriaNeural\",\"text\":\"wanna\",\"rate\":\"-25%\"},{\"break\":\"800ms\"},{\"voice\":\"en-US-AriaNeural\",\"text\":\"I wanna go home.\",\"rate\":\"-25%\"}]"
}
```

Send sequentially (Hard Rule 3): report `tg_msg type="text"`, THEN coaching `tg_msg type="voice"`. Don't bundle into `keyboard` — there are no buttons in this branch.

Append `🎯 发音示范` to `ui_feedback` so State D records that coaching was given.

### State D: Persist Evidence

Call `persist action="practice"` (or omit `action`) **before** sending the State C feedback `tg_msg`.

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
  "mode": "study",
  "ui_feedback": "<comma-joined exact labels of every button tapped this round, e.g. '🐢 慢速播放' — empty if no button tapped>",
  "metadata": "{\"tier\":\"intermediate\",\"clip_words\":12,\"promotion_credit_after\":1,\"demotion_credit_after\":0}",
  "errors": "[{\"key\":\"connected_speech_breakdown\",\"category\":\"listening\",\"severity\":\"medium\",\"original\":\"\",\"correction\":\"gonna\",\"note\":\"Failed to keep up at the 'gonna' linking; phoneme accuracy was OK but rhythm broke.\"},{\"key\":\"rhythm_chunking_error\",\"category\":\"listening\",\"severity\":\"low\",\"original\":\"\",\"correction\":\"\",\"note\":\"Stuttered between the 2nd and 3rd chunk; lost beat.\"}]",
  "subcap_scores": "[{\"key\":\"listening.connected_speech\",\"score\":6.0,\"evidence\":\"Stumbled on the 'gonna' linking and the schwa in 'to'.\"}]"
}
```

`prompt_hash` = first 16 hex chars of `SHA-1(normalized prompt)`; normalize = lowercase + strip punctuation + collapse whitespace. Read dedup window via `recent_practice.recent_prompt_hashes` (§1).

`ui_feedback` mandatory whenever any 🐢/😵 button was tapped, even on `fluency ≥ 80` — without it, `learner-state` over-promotes "kept up only at slow speed" passes.

State D persists fully-attempted clips only (with or without slow-down). Abandoned-on-too-hard rows are written by State B.

### State E: Continue (`shadow_next`)

- Re-call `persist action="recent_practice"` (§1) for credits + dedup. Don't reconstruct from chat memory.
- Apply §2.3 (skip `redo_count > 0`) before generating.
- **NEVER re-call `coach_context` within the same skill session.** It is cached server-side (5-min TTL) and expensive. Only `recent_practice` needs re-reading for credits / dedup.
- Generate next clip (State A step 1 — incl. dedup).

### State F: Implicit re-practice (`accuracy < PASS` loop)

When the user sends another voice message after a sub-pass evaluation (no buttons shown), treat as consolidation retry on the **same passage**:

1. **Recover parent sample** from chat memory (`id`, `prompt`, `prompt_hash`, `audio_path`, `redo_count`). If session was compacted, `persist {"action":"recent_practice","session_id":"<session>","skill_type":"listening.shadowing","limit":1}` and grab them from the most-recent row. Do NOT regenerate the passage.
2. Run `pron_assess` with the recovered `prompt` as `reference_text` and the user's new audio.
3. Persist via State D **with these overrides**:
   - `parent_sample_id` = previous round's sample `id`
   - `redo_count` = `(previous.redo_count ?? 0) + 1` (null/missing → 0; first retry → 1)
   - `prompt_hash` = same as previous (intentional collision — same item)
   - `metadata` includes `"is_redo": true` and `"parent_fluency": <previous raw_score>`
4. Apply the **same binary button logic** as State C:
   - Still `< PASS` → no buttons; fresh coaching TTS (different chunk if possible); prompt to re-practice.
   - `≥ PASS` → `shadow_next` + `nav:main`. Skip coaching TTS — success doesn't need it.

## 4. Collaborates With

- `planner`: routes here when listening rhythm / connected-speech / chunking is the highest-value drill.
- `learner-state`: reads persisted evidence, computes long-running tempo state, updates `MEMORY.md`.
- `coach`: uses errors/subcap scores to explain rhythm/linking patterns.
- `speaking-shadowing`: complementary phoneme-focused skill (see §1 disambiguation).
- `support/data-contract`: defines the `persist` write protocol.

## 5. Failure And Fallbacks

- `tts` fails → text error, no fake `audio_path`. Offer retry / menu.
- `pron_assess` fails → brief feedback that assessment was unavailable; offer `shadow_next`. Don't persist a fake fluency score.
- `persist` fails → still send feedback, but say it was not saved.
- User types instead of recording → prompt for voice; typed answer is not a valid shadowing attempt.
- `<tg-spoiler>` is client-side; no callback. Don't invent `spoiler_used`.
- Empty / inaudible audio → ask once: replay / `shadow_hard` / skip. If skipped, `completed=0`.

## 6. Hard Rules

1. **No early reveals**: never show the transcript before they attempt, except inside `<tg-spoiler>`.
2. **Score rhythm, not phonemes**: fluency drives credits; pronunciation accuracy goes to `band_pronunciation`.
3. **Voice before instruction, sequential.** Never `tg_msg type="voice"` and `type="keyboard"` in parallel.
4. Use `persist` for reads/writes; no raw DB.
5. Don't update `MEMORY.md`; `learner-state` owns durable state.
6. **Binary buttons by `accuracy` vs `PASS`**: `< PASS` → no buttons + coaching TTS + forced re-practice; `≥ PASS` → `shadow_next` + `nav:main`. Never a dedicated retry button.
7. **Feedback content (not format)**: every report covers 4 scores (准确度/流利度/完整度/韵律感), correct passage, brief translation, specific rhythm/linking diagnosis. Format is the LLM's call — no fixed template.
8. **Persist before feedback**: `await persist(...)` returns before sending the evaluation. State F needs the row in DB.
9. **One-call keyboard**: when buttons are shown, report text + buttons in a single `tg_msg type="keyboard"` call. Never split.
