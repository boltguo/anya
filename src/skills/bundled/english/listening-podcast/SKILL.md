---
name: listening-podcast
description: "Extensive listening practice for grasping the main idea, not dictation. Trigger for '泛听', 'listen to a podcast', 'news', 'extensive listening'."
---

# Listening Podcast (Extensive & Gist)

Extensive listening for **gist**, not transcription. The learner listens once and types a Chinese summary; we score how well they caught the main idea (and the pivot, if any). The signal that drives i+1 is a **rubric-graded gist score** (0..1), not binary pass/fail.

## 1. Inputs

Use this skill when:

- User says: `泛听`, `listen to a podcast`, `news`, `extensive listening`.
- Callback/System trigger: `listening-podcast`.

Required context before generating audio:

1. Call `persist` with `{"action":"recent_practice","session_id":"<session>","skill_type":"listening.podcast","limit":"DEDUP_WINDOW"}`. This returns the last `DEDUP_WINDOW` samples (incl. abandoned) with `accuracy` (rubric-scored 0..1), `prompt_hash`, `completed`, `ui_feedback`, decoded `metadata` — the canonical short-term state for credit gating (§2.3) and dedup (§2.4). The flat `recent_prompt_hashes` array is the authoritative dedup window.
2. Call `persist` with `{"action":"coach_context","days":14,"limit":8}` for the longer-window aggregate (subcaps, errors, due tasks). Treat as the slower-moving signal — only re-call when tier changes.
3. Use `MEMORY.md` / `USER.md` only as fallback prompt context.
4. Do not query `study.db` directly.

## 2. Difficulty Policy

The target is **i+1**: one small stretch above the learner's current successful comprehension level. Adapt script length / topic abstraction / fillers / accent; never throw a 2-minute fast UK academic clip at someone still parsing 30-second daily-life slow US.

### 2.0 Tunable constants

These are the only knobs in this skill. Every threshold below references one of them — change the constant here, not the prose.

| Constant | Value | Meaning |
| --- | --- | --- |
| `PASS_THRESHOLD` | `0.70` | A round with `accuracy ≥ PASS_THRESHOLD` counts as a pass for credit purposes. Lower than dictation/shadowing because gist comprehension is forgiving by design. |
| `FAIL_THRESHOLD` | `0.40` | Below this is a fail (totally missed the main idea). Wider hold band reflects rubric noise. |
| `STREAK` | `2` | Consecutive passes (or fails) needed to move tier. |
| `ACC_WINDOW` | `3` | Sample window for §2.2 recent-accuracy mean. |
| `DEDUP_WINDOW` | `20` | Size of the rolling `prompt_hash` dedup window fetched per session via `recent_practice` (§1). |

**Score rubric (CRITICAL — replaces the old binary 1/0):** grade the learner's Chinese summary on this scale, then pass it as `accuracy`:

| Score | Rubric |
| --- | --- |
| `1.00` | Main idea + key pivot/turn captured precisely. |
| `0.85` | Main idea captured; pivot phrased imprecisely but recognized. |
| `0.70` | Main idea right; missed the pivot ("However…") and stopped at the surface claim. |
| `0.50` | Got a related sub-idea or one supporting fact; missed the main thrust. |
| `0.25` | Off-topic but at least the domain was right (e.g., user heard "tech" but missed the actual subject). |
| `0.00` | Totally off, hallucinated content, or no answer. |

Use this rubric verbatim — do **not** reward typing length, English grammar, or detail recall. This skill measures **comprehension of the main idea**, nothing else. The granular `listening.gist` subcap score (0–10) goes into `subcap_scores`, separately, for `coach`/`learner-state`.

### 2.1 Tier table (length, topic, fillers)

Audio is always rendered at **standard 100% speed**. Slow-down is a per-round reactive tool exposed via the `pod_slow` button — it is **not** a tier property and does **not** belong here.

| Tier (Listening band) | Script length | Topic & register | Fillers / Accent |
| --- | --- | --- | --- |
| Beginner (< 5.0) | 30–40 seconds | Daily life, clear context (food, weather, travel) | No fillers; standard US/UK |
| Intermediate (5.0–6.0) | 60–75 seconds | Light academic or news context (history, science 101, current events) | Mild fillers (`um`, `you know`); standard US/UK |
| Advanced (≥ 6.5) | 90–120 seconds | Abstract / opinion-led / technical | **MUST inject 10–15% spoken fillers** (`um`, `like`, `you know`, false starts) and use non-standard accents (`en-GB`, `en-AU`) to simulate real-world noise |

### 2.2 Recent-accuracy window

"Recent accuracy" is **strictly defined** as:

1. **Primary** — mean `accuracy` over the last `ACC_WINDOW` `completed=1` rows in `recent_practice.rows` (already filtered by `skill_type='listening.podcast'` and the current `session_id`). Abandoned rows (`completed=0`) are **not** included in the mean but DO count toward `demotion_credit`.
2. **Fallback** — if `recent_practice` returned fewer than `ACC_WINDOW` completed rows, use the 14-day `listening.gist` average from `coach_context.summary.subcaps`.
3. **Cold start (profile present)** — if neither source is available but `MEMORY.md` has a declared listening band, treat the learner as one tier below that band and start at the **shortest** script.
4. **Cold start (no profile)** — start at **Beginner tier, 30-second daily-life script**. Never guess upward.

Single-round swings are ignored. The window is always `ACC_WINDOW`.

### 2.3 Credit gating — `promotion_credit` / `demotion_credit`

Track two running counters across the session, computed from `recent_practice.rows` (§1):

- `promotion_credit` — count of consecutive recent rounds with `accuracy ≥ PASS_THRESHOLD`, counting back from the most recent. **Stops** as soon as a fail (`accuracy < FAIL_THRESHOLD` or `completed=0`) is hit; **passes through** hold rounds (`[FAIL_THRESHOLD, PASS_THRESHOLD)`) unchanged.
- `demotion_credit` — symmetric: consecutive fails, stopped by any pass; holds pass through. An abandoned row (`completed=0`, written by `pod_hard`) counts as one fail.

| Credit | Action |
| --- | --- |
| `promotion_credit ≥ STREAK` at the **current tier ceiling** | Promote to the next tier; reset both credits; start at next tier's shortest script. |
| `promotion_credit ≥ STREAK` **inside** the tier | Stay in tier; bump script length by **+15 seconds** (clamped to tier max); reset `promotion_credit`. |
| `demotion_credit ≥ STREAK` at the **current tier floor** | Demote to previous tier; reset both credits; start at previous tier's longest script. |
| `demotion_credit ≥ STREAK` **inside** the tier | Stay in tier; drop script length by **−15 seconds** (clamped to tier min); reset `demotion_credit`. |
| Hard-button tap (`pod_hard`) | Persists an abandoned row (State B), which `recent_practice` will surface as a fail next call — no separate counter bookkeeping. |

**Retry rows are skipped from credit counting.** Any row with `redo_count > 0` (written by `pod_retry`, see State F) is consolidation evidence, not native-tempo competence. Ignore those rows when walking `recent_practice.rows` for credits; they still count for dedup.

Hold rounds: keep the same length, optionally swap **one** dimension (topic / filler density / accent) to probe a specific weakness.

### 2.4 Generation rules

- Pick a topic that overlaps the user's interests (`USER.md`/`MEMORY.md`) when known, otherwise default to a general-interest current-events angle.
- Each new script may stretch **at most one** dimension beyond the previous: length, topic abstraction, filler density, or accent. Never combine two stretches.
- Do **not** repeat a script whose `prompt_hash` already appears in `recent_practice.recent_prompt_hashes`.
- Do not use the same topic family (e.g., "AI / tech") for more than 2 consecutive rounds.
- For Advanced tier: fillers are mandatory, not decoration. Bake them into the TTS-input text so the rendered audio actually contains them.

## 3. Flow

### State A: Prepare And Deliver

1. Decide tier and script length from §2.3. Generate one natural English podcast-style script at the chosen length / topic / register / filler density. Compute its `prompt_hash` and reject if it appears in `recent_practice.recent_prompt_hashes`; regenerate.
2. Use `tts` only for the target script at standard 100% speed. Do not synthesize conversational filler. Send via `tg_msg(type="voice")`.
3. Send the instruction with `tg_msg(type="keyboard")`:
   - **Text**: `🎧 听听这段播客。不用抓每一个字，**你觉得他最想表达的核心观点是什么？** (可以用中文回答)\n\n实在听不出可以点开看原文：<tg-spoiler>{correct English script}</tg-spoiler>`
   - **Buttons**: `[["🐢 慢速播放|pod_slow", "😵 完全听不懂|pod_hard"]]`
4. **Initialize a per-round `ui_feedback` accumulator** (empty string). Every button tap below MUST append the exact button label.
5. **Stop** and wait for the user's typed Chinese summary or button tap.

### State B: Button Handling (Before typing)

`pod_slow`:

- **Append `🐢 慢速播放` to the round's `ui_feedback` accumulator** (mandatory — survives into State D's persist call so a "got the gist only after slow-down" attempt is not mistaken for native-speed comprehension).
- Acknowledge with `tg_msg(type="text")`.
- Reuse the same script; generate slower audio with `tts` at `rate="-10%"`; send the voice + same keyboard. Wait.

`pod_hard`:

- **STEP 1 — Negative Evidence Lock-in (MANDATORY).** A "completely lost" reaction at this tier is the highest-value signal `learner-state` can use to drop the listening level; persist it before generating the replacement:

  ```json
  {
    "action": "practice",
    "skill_type": "listening.podcast",
    "session_id": "<session>",
    "completed": 0,
    "accuracy": 0,
    "prompt": "<the original English script that was abandoned>",
    "prompt_hash": "<sha1(normalized prompt) first 16 chars>",
    "response": "",
    "feedback": "Learner tapped '完全听不懂' before answering. Treat as strong negative evidence at the current tier.",
    "audio_path": "<tts file path of the abandoned audio>",
    "ui_feedback": "😵 完全听不懂",
    "section": "listening",
    "domain": "listening",
    "load_score": 0,
    "minutes": 0,
    "mode": "study",
    "metadata": "{\"abandoned_reason\":\"too_hard\",\"tier\":\"<beginner|intermediate|advanced>\",\"script_seconds\":<approx>}"
  }
  ```

  After `persist` returns, **reset the round** — start a fresh `ui_feedback` accumulator.

- **STEP 2 — Replacement.** Apply the demotion / length-down rule from §2.3 (the abandoned row will surface as one fail in the next `recent_practice` call). Acknowledge naturally via `tg_msg(type="text")`, briefly explain the topic in Chinese for context, generate a new shorter / simpler script, and return to State A.

### State C: Evaluate

When the user submits their gist summary:

1. **Do NOT correct grammar / spelling** in their answer. Focus only on comprehension.
2. **Grade against §2.0 rubric** to produce a continuous `accuracy` (0..1). Identify whether they got tricked by discourse markers like "However" — that's the most common pivot trap.
3. **Compute** `subcap_scores.listening.gist` on the 0–10 scale (`accuracy * 10`, then refine with one-line evidence).
4. Send feedback and persist in the same evaluation turn.

Feedback message must include:

- A brief Chinese evaluation of their understanding.
- The specific phrase / turning point in the audio that carried the main idea (so they know what to listen for next time).

Buttons (layout depends on accuracy):

- If `accuracy < PASS_THRESHOLD`:
  ```json
  [["🔁 同段再听一次|pod_retry", "🔄 下一篇|pod_next"], ["🧭 练习其他|nav:main"]]
  ```
- If `accuracy ≥ PASS_THRESHOLD`:
  ```json
  [["🔄 再听一篇|pod_next", "🧭 练习其他|nav:main"]]
  ```

### State D: Persist Evidence

Call `persist` with `action="practice"` (or omit `action`) **in parallel** with the State C feedback `tg_msg`.

Minimum payload:

```json
{
  "skill_type": "listening.podcast",
  "session_id": "<session>",
  "prompt": "<the podcast script>",
  "prompt_hash": "<sha1(normalized prompt) first 16 chars>",
  "response": "<user's Chinese summary>",
  "accuracy": 0.70,
  "raw_score": 0.70,
  "max_score": 1,
  "feedback": "<IN ENGLISH: did they grasp the gist? what was the pivot? what carried the main idea?>",
  "audio_path": "<tts file path>",
  "section": "listening",
  "domain": "listening",
  "load_score": 2,
  "minutes": 1,
  "ui_feedback": "<comma-joined exact labels of every button tapped this round, e.g. '🐢 慢速播放' — empty if no button tapped>",
  "metadata": "{\"tier\":\"intermediate\",\"script_seconds\":60,\"topic\":\"daily_life\",\"promotion_credit_after\":1,\"demotion_credit_after\":0}",
  "subcap_scores": "[{\"key\":\"listening.gist\",\"score\":7.0,\"evidence\":\"<IN ENGLISH: e.g. Understood main topic but missed the pivot at 'However'>\"}]"
}
```

**`prompt_hash` (mandatory)** — first 16 hex chars of SHA-1 over the normalized prompt (lowercased, punctuation stripped, whitespace collapsed). Dedup window is **read** via `recent_practice.recent_prompt_hashes` (§1).

**`ui_feedback` is mandatory whenever any 🐢/😵 button was tapped this round**, even if the learner eventually summarized the gist correctly. Without it, `learner-state` will treat a "got it only after slow-down" pass as native-speed comprehension and over-promote.

Abandoned-on-too-hard records are written by State B (`pod_hard`) — do not duplicate them here. State D only persists fully-attempted scripts (with or without slow-down).

### State E: Continue (`pod_next`)

- Re-call `persist action="recent_practice"` (§1) — this is **the** source of truth for `promotion_credit` / `demotion_credit` and dedup. Do not reconstruct from chat memory.
- Apply the §2.3 rules (skipping `redo_count > 0` rows for credit purposes) to decide the next round's tier and script length **before** generating.
- Skip the `coach_context` re-call unless the just-applied rule changed tier.
- Generate the next script (State A step 1, including the `recent_prompt_hashes` dedup check). Pick a topic that respects the "no more than 2 consecutive same family" rule.

### State F: Retry the same script (`pod_retry`)

Triggered by the conditional retry button (only shown when accuracy was below `PASS_THRESHOLD`). Intent: **consolidation at the same difficulty**, not a new probe — bypass tier/length recomputation. Especially useful for podcast since "missed the pivot once" benefits from a second focused listen.

1. **Recover the parent sample.** Call `persist action="recent_practice"` with `limit=1, skill_type="listening.podcast"` and grab the most recent row's `id`, `prompt`, `prompt_hash`, `audio_path`, `accuracy`.
2. **Replay the same audio.** Re-send the existing `audio_path` via `tg_msg(type="voice")`. **Do not re-call `tts`**. (Fall back to a fresh `tts` on the same `prompt` at standard 100% speed if `audio_path` is missing.)
3. **Resend the instruction keyboard with a focused hint.** Same buttons (`pod_slow` / `pod_hard`); add a 1-line nudge in the instruction text like `💡 上次抓到了 ___，这次注意听第二段开头的转折。` (substitute the actual gap from the parent feedback).
4. **Initialize a fresh `ui_feedback` accumulator**.
5. **Wait** for the user's new Chinese summary.
6. **On answer:** run State C grading, then persist via State D **with these overrides**:
   - `parent_sample_id` = parent row's `id`
   - `redo_count` = parent's `redo_count + 1`
   - `prompt_hash` = parent's `prompt_hash` (intentional collision)
   - `prompt` = parent's `prompt`
   - `audio_path` = parent's `audio_path` (or fresh fallback)
   - `metadata` includes `"is_redo": true` and `"parent_accuracy": <parent's accuracy>`
7. After persisting, present the same conditional button layout from State C.

## 4. Hard Rules

1. **NO Dictation**: NEVER ask the user to type exactly what they heard. This skill is gist-only.
2. **No Early Reveals**: NEVER show the English transcript outside of `<tg-spoiler>...</tg-spoiler>`.
3. **No Conversational TTS**: the `tts` tool is only for the practice material.
4. **Use the §2.0 rubric verbatim** when grading — do not reward summary length, English grammar, or detail recall over comprehension of the main idea.
5. **Use `persist` for learner reads/writes**. No raw DB access.
6. **Do not update `MEMORY.md`** — `learner-state` owns durable ability state.
