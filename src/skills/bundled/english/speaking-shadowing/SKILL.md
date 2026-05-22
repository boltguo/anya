---
name: speaking-shadowing
description: "Speaking Pronunciation Clinic. Trigger ONLY when the user explicitly wants to correct their pronunciation of specific sounds (e.g. /θ/, /r/), or do deep phoneme-level practice."
---

# Speaking Shadowing (Pronunciation Clinic)

Different from `listening-shadowing` (rhythm clinic). Goal here: phoneme-level accuracy. The signal driving i+1 is **pronunciation accuracy**, not fluency.

## 1. Inputs

Trigger when:

- User says: `练发音`, `纠正口音`, `怎么读`, `pronunciation`.
- Callback `speaking-shadowing`.
- **Disambiguation**: explicit phoneme/发音/口音/不会读 → here. Bare `跟读` defaults to `listening-shadowing` (rhythm) — that's a different drill.

Required context before generating:

1. `persist {"action":"recent_practice","session_id":"<session>","skill_type":"speaking.shadowing","limit":20}` (`limit` int, not `"DEDUP_WINDOW"` string — `Number()` would NaN it). Returns rows with `accuracy` (= pron accuracy/100), `prompt_hash`, `ui_feedback`, decoded `metadata` + flat `recent_prompt_hashes`. Source of truth for §2.3 credit and §2.4 dedup.
2. `persist {"action":"coach_context","days":14,"limit":8}` for subcaps / errors / due phonemes. Slow signal — only re-call when tier changes.
3. `MEMORY.md` / `USER.md` only as fallback. No raw `study.db` access.

## 2. Difficulty Policy

Target **i+1**: one stretch above the learner's current successful pronunciation. Adapt sentence length / phoneme density / linking; never combine multiple stretches.

### 2.0 Constants & Tier

| Constant | Value | Meaning |
| --- | --- | --- |
| `PASS_THRESHOLD` | `0.85` | `accuracy ≥ PASS` (= Azure pron accuracy ≥ 85) is a pass. Set high because phoneme accuracy is exactly what this drill targets; a lower bar over-promotes "almost-right" attempts. |
| `FAIL_THRESHOLD` | `0.60` | Below = fail; `[FAIL, PASS)` = "hold". |
| `STREAK` | `2` | Passes/fails to move tier / length. |
| `ACC_WINDOW` | `3` | Sample window for §2.2 mean. |
| `DEDUP_WINDOW` | `20` | Rolling `prompt_hash` window. |

**Score normalization (CRITICAL):** `pron_assess` returns 4 scores 0–100: `accuracy`, `fluency`, `completeness`, `prosody`. DB `accuracy` column = `pron_accuracy / 100` (this drives credit gating — pronunciation accuracy is the i+1 signal). `fluency` goes to `subcap_scores.speaking.fluency` separately for `learner-state`; not used for tier decisions.

Standard 100% speed only. Slow-down is the `speak_slow` button (State B), not a tier property.

| Tier (IELTS band ≈ CEFR) | Words | Focus |
| --- | --- | --- |
| Beginner (< 5.0 ≈ A1–A2) | 5–8 | Simple phonemes, individual word clarity |
| Intermediate (5.0–6.0 ≈ B1) | 10–15 | Linking, stress, common traps (th/s, r/l) |
| Advanced (≥ 6.5 ≈ B2+) | 15–20 | Fast connected speech, intonation, rhythm |

**Reading the learner's level from `MEMORY.md`** (do NOT confuse capability score 0–100 with IELTS band 0–9):

1. Prefer `Band Snapshot.Speaking` (CEFR string). Map: `A1`/`A2` → Beginner, `B1` → Intermediate, `B2`/`C1`/`C2` → Advanced.
2. Boundary suffix (`A2+`, `B1-`, `... → ... boundary`): **降一级起步**. E.g. `A2+` → Beginner.
3. If CEFR missing, fall back to `Weak Spots.Speaking` sub-cap scores (0–10): take the lowest sub-cap and use the tier table above.
4. **Never** read `Core Capabilities.Speaking: <n>/100` as IELTS band — that's a 0–100 capability score.

### 2.2 Recent-accuracy

Mean `accuracy` over last `ACC_WINDOW` `completed=1` rows of current `session_id` + `skill_type`. Abandoned (`completed=0`) excluded from mean but count as fail for `demotion_credit`.

Fallback chain when fewer than `ACC_WINDOW` rows: 14-day mean from `coach_context.summary` → `MEMORY.md` band − 1 tier at min length → Beginner min (5 words). Never guess upward.

### 2.3 Credit gating

```
promotion_credit = walk recent_practice.rows newest→oldest (skip redo_count>0):
  count consecutive accuracy ≥ PASS; reset on any fail (< FAIL or completed=0); holds ([FAIL, PASS)) pass through.
demotion_credit = mirror: count consecutive fail; reset on any pass; holds pass through.
abandoned (completed=0, written by `speak_hard`) = 1 fail.
```

| Credit | Action |
| --- | --- |
| `promotion_credit ≥ STREAK` at tier ceiling | Promote tier; reset both credits; start at next tier's min length. |
| `promotion_credit ≥ STREAK` inside tier | Length **+2**; reset `promotion_credit`. |
| `demotion_credit ≥ STREAK` at tier floor | Demote tier; reset both credits; start at prev tier's max. |
| `demotion_credit ≥ STREAK` inside tier | Length **−2**; reset `demotion_credit`. |
| `speak_hard` tap | Persists abandoned row (State B); surfaces as fail next call. |

Retry rows (`redo_count > 0`) skipped from credit; still count for dedup.

Hold: keep length, optionally swap **one** dimension (target phoneme / linking / stress) to probe a different weakness from `coach_context.summary.errors`.

### 2.4 Generation

- Pick **one** target phoneme/sound from `coach_context.summary.errors|subcaps` — prefer recurring phoneme issues (/θ/, /ð/, /r/, /l/, /v/, /w/, vowel pairs).
- Stretch **at most one** dimension per round: length, phoneme density, linking, stress.
- Reject any sentence whose `prompt_hash` ∈ `recent_practice.recent_prompt_hashes`.
- Don't repeat the same target phoneme for 2+ consecutive rounds.
- **Topic rotation**: alternate work themes (frontend, AI tools, remote-work English, interview scenarios) with the learner's hobbies in `USER.md` (films, games, anime, comedy variety). Do not default every sentence to coding/AI just because the learner works in tech.

## 3. Flow

### State A: Prepare And Deliver

1. From §2.3 + §2.4, decide tier and length, target phoneme, topic (rotate). Generate the sentence at chosen length / phoneme density. Compute `prompt_hash` (§State D); regenerate on dedup hit.
2. `tts` only for the target sentence at 100% speed. No filler audio.
3. Send the prompt as **one** `tg_msg type="render"` call (`terminal: true`). The renderer plays the voice first, then attaches the instruction text + buttons.

   ```json
   {
     "type": "render",
     "media": { "type": "voice", "url": "<tts file path>" },
     "text": "🎧 先听示范，然后按住录音键**朗读原句**，我来帮你揪出发音细节。\n\n原文：||{correct English sentence}||",
     "buttons": [["🐢 慢速示范|speak_slow", "😵 太长了，换短句|speak_hard"]],
     "terminal": true
   }
   ```

4. Init empty `ui_feedback` accumulator; every button tap appends its exact label.
5. Wait for the user's voice message or button tap.

### State B: Button Handling (before recording)

`speak_slow`:

- Append `🐢 慢速示范` to `ui_feedback` (mandatory — survives into State D so a "passed only at slow speed" attempt is not mistaken for native-tempo competence).
- Same sentence; `tts rate="-10%"`.
- Re-send via one `tg_msg type="render"` (`terminal: true`) — slow voice + same instruction text + same two buttons. The brief ack can sit on the first line of `text` (e.g. `"慢一档，再示范一次🐢"`); no separate `type="text"` call.

`speak_hard`:

1. **Persist abandoned record FIRST.** A "drop the level" tap is exactly the signal `learner-state` needs to lower the phoneme target; it MUST hit the database before being replaced:

   ```json
   {
     "action": "practice",
     "skill_type": "speaking.shadowing",
     "session_id": "<session>",
     "completed": 0,
     "accuracy": 0,
     "prompt": "<the original sentence that was abandoned>",
     "prompt_hash": "<sha1(normalized prompt) first 16 chars>",
     "response": "",
     "feedback": "Learner tapped '😵 太长了，换短句' before recording. Treat as negative evidence at the current tier.",
     "audio_path": "<tts file path of the abandoned audio>",
     "ui_feedback": "😵 太长了，换短句",
     "section": "speaking",
     "domain": "speaking",
     "load_score": 0,
     "minutes": 0,
     "mode": "study",
     "metadata": "{\"abandoned_reason\":\"too_long\",\"tier\":\"<beginner|intermediate|advanced>\",\"sentence_words\":<n>,\"target_phoneme\":\"<phoneme>\"}"
   }
   ```

   After `persist` returns, reset the round (fresh `ui_feedback` accumulator).

2. **Replacement.** Apply the demotion / length-down rule from §2.3 (the abandoned row will surface as one fail in the next `recent_practice` call). Generate a new shorter sentence; the brief ack ("换一句短一点的👇") can sit on the first line of State A's render `text` — no separate `tg_msg type="text"` call.

### State C: Evaluate

When the user sends a voice message:

1. Run `pron_assess` with the user's `audio_path` and the sentence's `reference_text`. `granularity=Phoneme` for this skill (see `speaking-azure-score`). Returns 4 scores 0–100: `accuracy`, `fluency`, `completeness`, `prosody`.
2. Map for DB:
   - `accuracy = pron_accuracy / 100` (drives credit gating)
   - `raw_score = pron_accuracy`, `max_score = 100`
3. Identify 1–2 specific phonemes/words that failed in Azure `words[]` — drives `errors` / `subcap_scores`.
4. **Persist FIRST, THEN feedback.** Sequential — State F's parent-sample lookup needs the row in DB before the next voice message arrives.

Feedback content (no fixed header/template) — every reply MUST cover, in some natural form:

- the four `pron_assess` scores. Use the **exact 3-character labels** so the line aligns visually: **准确度 / 流利度 / 完整度 / 韵律感**. Show all four numbers.
- the correct English sentence
- a 1-line Chinese translation
- For `accuracy ≥ PASS`: brief praise. For `< PASS`: name the specific 1–2 phonemes/words that failed + 1–2 articulatory instructions. Example: "👉 **/θ/ 音纠正**：舌尖要轻轻咬在上下齿之间，让气流摩擦而出，不要发成 /s/。"

Two to four sentences after the score line, conversational.

**Delivery (binary by `accuracy` vs `PASS_THRESHOLD`)** — always one `tg_msg type="render"` (`terminal: true`):

- `accuracy < PASS` (Azure pron < 85) — forced re-practice, **NO buttons**:
  1. Generate coaching audio (see "Low-score coaching TTS" below).
  2. Send one render envelope: coaching voice as `media`, feedback + nudge (`对照刚才的精度示范，按住录音再读一遍发给我！💪`) as `text`, no `buttons`, no `react`. The renderer will dispatch the voice first, then the text — single tool call, single LLM turn.

     ```json
     {
       "type": "render",
       "media": { "type": "voice", "url": "<coaching audio path>" },
       "text": "<feedback line(s) + nudge>",
       "terminal": true
     }
     ```

  3. Wait for the next voice message → re-evaluate via State F.

- `accuracy ≥ PASS` (Azure pron ≥ 85, clean pass): one render envelope with `react` + feedback text + next buttons. **No coaching audio.**

     ```json
     {
       "type": "render",
       "react": { "target": "user", "emoji": "🔥" },
       "text": "<short feedback with the 4 scores line>",
       "buttons": [["🔄 练下一句|speak_next", "🧭 练习其他|nav:main"]],
       "terminal": true
     }
     ```

     Emoji policy: `accuracy = 1.0` → `🔥`; `≥ PASS` but `< 1.0` → `👍`. Never use `tg_msg type="react"` as a standalone call (see Hard Rule 9).

**Max retry rule**: If the **same phoneme** has failed 3 consecutive times across re-practices (State F), stop drilling it. Send a short ack ("这个音今天先放一放，下次再攻克 💪"), auto-advance to `speak_next` (State E). Prevents frustration loops.

**Low-score coaching TTS** (mandatory when `accuracy < PASS`):

Goal: a focused, **slow + clear** phonemic model for the **specific 1–2 sounds/words** they mispronounced — not a slow copy of the full sentence (Telegram lets them replay the original).

1. From `pron_assess` word-level scores (Azure `words[]`), pick **at most 2** items with the lowest accuracy. Prefer phoneme-specific issues (/θ/, /ð/, /r/, /l/, /v/, /w/, vowel pairs) over whole multi-syllable words — this drill is phoneme-focused.
2. **Use `tts` segments mode** (renders proper SSML `<break time="..."/>` — clean breath gaps, not mumbled ellipses). Per item, 3 segments:
   1. Voice: the **isolated word or minimal pair** (e.g. `"think"`, or `"think / sink"`)
   2. `{"break":"800ms"}`
   3. Voice: a **short context phrase** containing the target sound (e.g. `"I think it's right."`)
3. Every voice segment uses `"rate": "-25%"` (genuinely slow — `-10%` isn't enough; the learner needs every consonant/vowel to land). Same `voice` as the original clip.
4. Between two items: `{"break":"1500ms"}`.
5. No English narration ("Listen to this phoneme:") — pure model phrases only; the report text already explains in Chinese.
6. Target length 8–15 seconds at the slow rate.

Example call (one item — `/θ/`):

```json
{
  "segments": "[{\"voice\":\"en-US-AriaNeural\",\"text\":\"think\",\"rate\":\"-25%\"},{\"break\":\"800ms\"},{\"voice\":\"en-US-AriaNeural\",\"text\":\"I think it's right.\",\"rate\":\"-25%\"}]"
}
```

Append `🎯 发音示范` to `ui_feedback` so State D records that coaching was given.

### State D: Persist Evidence

Call `persist action="practice"` (or omit `action`) **before** sending the State C feedback `tg_msg`.

Minimum payload:

```json
{
  "skill_type": "speaking.shadowing",
  "session_id": "<session>",
  "prompt": "<correct sentence>",
  "prompt_hash": "<sha1(normalized prompt) first 16 chars>",
  "response": "<transcription from pron_assess>",
  "accuracy": 0.82,
  "raw_score": 82,
  "max_score": 100,
  "feedback": "<IN ENGLISH: phoneme/articulation verdict + 1-2 specific sound failures from Azure words[]>",
  "audio_path": "<tts file path>",
  "section": "speaking",
  "domain": "speaking",
  "load_score": 2,
  "minutes": 1,
  "mode": "study",
  "ui_feedback": "<comma-joined exact labels of every button tapped this round, e.g. '🐢 慢速示范' — empty if none>",
  "metadata": "{\"tier\":\"intermediate\",\"sentence_words\":12,\"target_phoneme\":\"/θ/\",\"promotion_credit_after\":1,\"demotion_credit_after\":0}",
  "errors": "[{\"key\":\"pronunciation_consonant\",\"category\":\"speaking\",\"severity\":\"medium\",\"original\":\"sink\",\"correction\":\"think\",\"note\":\"Substituted /s/ for /θ/ in 'think'.\"}]",
  "subcap_scores": "[{\"key\":\"speaking.pronunciation\",\"score\":8.2,\"evidence\":\"Azure pron accuracy 82; /θ/ failed in 'think'.\"},{\"key\":\"speaking.fluency\",\"score\":7.5,\"evidence\":\"Slight pauses but rhythm preserved.\"}]"
}
```

`prompt_hash` = first 16 hex chars of `SHA-1(normalized prompt)`; normalize = lowercase + strip punctuation + collapse whitespace. Read dedup window via `recent_practice.recent_prompt_hashes` (§1).

`ui_feedback` mandatory whenever any 🐢 / 😵 / 🎯 marker was added, even on `accuracy=1.0` — without it, `learner-state` over-promotes "passed only at slow speed" passes.

State D persists fully-attempted sentences only (with or without slow-down). Abandoned-on-too-long rows are written by State B.

Error keys: `pronunciation_vowel`, `pronunciation_consonant`, `pronunciation_stress`, `consonant_cluster`, `connected_speech_fail`, `intonation` (see `speaking-azure-score` taxonomy).

### State E: Continue (`speak_next`)

- Re-call `persist action="recent_practice"` (§1) for credits + dedup. Don't reconstruct from chat memory.
- Apply §2.3 (skip `redo_count > 0`) before generating.
- **NEVER re-call `coach_context` within the same skill session.** It is cached server-side (5-min TTL) and expensive. Only `recent_practice` needs re-reading for credits / dedup.
- Generate next sentence (State A step 1 — incl. dedup, topic rotation per §2.4).

### State F: Implicit re-practice (`accuracy < PASS` loop)

When the user sends another voice message after a sub-pass evaluation (no buttons shown), treat as consolidation retry on the **same sentence**:

**⚡ Retry cost budget: 2 tool calls MAX per retry turn.** Do NOT re-call `recent_practice` or `coach_context` — tier cannot change mid-retry and the prompt is already known.

1. **Recover parent sample** from chat memory (`id`, `prompt`, `prompt_hash`, `audio_path`, `redo_count`). These are all available in the current conversation context — do NOT call `persist` to retrieve them. Only if the session was compacted and chat memory is truly empty, fall back to `persist {"action":"recent_practice","session_id":"<session>","skill_type":"speaking.shadowing","limit":1}`.
2. Run `pron_assess` with the recovered `prompt` as `reference_text` and the user's new audio. **(Tool call 1)**
3. Persist via State D **with these overrides** (still part of the same loop, before the render):
   - `parent_sample_id` = previous round's sample `id`
   - `redo_count` = `(previous.redo_count ?? 0) + 1` (null/missing → 0; first retry → 1)
   - `prompt_hash` = same as previous (intentional collision — same item)
   - `metadata` includes `"is_redo": true` and `"parent_accuracy": <previous accuracy>`
4. Send one `tg_msg type="render"` envelope (`terminal: true`) — same binary shape as State C:
   - Still `< PASS` → no buttons; fresh coaching TTS targeting a **different** phoneme if possible; coaching voice as `media`, feedback + nudge as `text`.
   - Still `< PASS` AND this is the **3rd consecutive fail on the same phoneme** → auto-advance (see "Max retry rule" in State C).
   - `≥ PASS` → `react` (🔥 / 👍) + feedback `text` + `[["🔄 练下一句|speak_next", "🧭 练习其他|nav:main"]]`. Skip coaching TTS — success doesn't need it.

## 4. Collaborates With

- `planner`: routes here when phoneme accuracy is the highest-value drill.
- `learner-state`: reads persisted evidence, computes long-running pronunciation state, updates `MEMORY.md`.
- `planner`: (proactive nudge) uses errors/subcap scores to explain articulation patterns.
- `listening-shadowing`: complementary rhythm-focused skill (see §1 disambiguation).
- `speaking-azure-score`: defines the `pron_assess` request/response contract and error taxonomy.
- `support/data-contract`: defines the `persist` write protocol.

## 5. Failure And Fallbacks

- `tts` fails → text error, no fake `audio_path`. Offer retry / menu.
- `pron_assess` fails → brief feedback that assessment was unavailable; offer `speak_next`. Don't persist a fake accuracy score.
- `persist` fails → still send feedback, but say it was not saved.
- User types instead of recording → prompt for voice; typed answer is not a valid pronunciation attempt.
- `<tg-spoiler>` is client-side; no callback. Don't invent `spoiler_used`.
- Empty / inaudible audio → ask once: replay / `speak_hard` / skip. If skipped, `completed=0`.

## 6. Hard Rules

1. **Never assess without the tool**: MUST use `pron_assess` to get real data. Don't guess pronunciation.
2. **Score phonemes, not rhythm**: pronunciation accuracy drives credits; fluency goes to `subcap_scores.speaking.fluency`.
3. **Every user-visible step ships as one `tg_msg type="render"` with `terminal: true`** — prompt delivery, slow replay, pass feedback, fail+coaching feedback. The renderer handles voice-before-text ordering internally; never split into separate `tg_msg type="voice"` + `type="text"` / `type="keyboard"` calls.
4. Use `persist` for reads/writes; no raw DB.
5. Don't update `MEMORY.md`; `learner-state` owns durable state.
6. **Binary delivery by `accuracy` vs `PASS`**: `< PASS` → render with coaching voice + nudge text, no buttons; `≥ PASS` → render with `react` (🔥/👍) + feedback text + `speak_next` / `nav:main` buttons. Never a dedicated retry button.
7. **Feedback content (not format)**: every report covers 4 scores (准确度/流利度/完整度/韵律感), correct sentence, brief translation, specific phoneme diagnosis. Format is the LLM's call — no fixed template.
8. **Persist before feedback**: `await persist(...)` returns before sending the render envelope. State F needs the row in DB.
9. **Reactions live inside the render envelope's `react` field.** Never use `tg_msg type="react"` as a standalone call for accuracy-driven 🔥/👍 — that costs an extra loop.
10. **3-fail auto-advance.** If the same phoneme fails 3 consecutive re-practices, stop drilling it and auto-advance to the next sentence.
