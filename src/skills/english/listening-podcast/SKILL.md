---
name: listening-podcast
description: "Extensive listening practice for grasping the main idea, not dictation. Trigger for '泛听', 'listen to a podcast', 'news', 'extensive listening'."
---

# Listening Podcast (Extensive & Gist)

Extensive listening for **gist**, not transcription. The learner listens once and types a Chinese summary; score how well they caught the main idea (and the pivot, if any).

## 1. Inputs

Trigger when:

- User says: `泛听`, `listen to a podcast`, `news`, `extensive listening`.
- Callback `listening-podcast`.

Required context before generating:

1. `persist {"action":"recent_practice","session_id":"<session>","skill_type":"listening.podcast","limit":20}` (`limit` int, not `"DEDUP_WINDOW"` string — `Number()` would NaN it). Returns rows with `accuracy` (rubric 0..1), `prompt_hash`, `ui_feedback`, decoded `metadata` + flat `recent_prompt_hashes`. Source of truth for §2.3 credit and §2.4 dedup.
2. `persist {"action":"coach_context","days":14,"limit":8}` for subcaps / errors / due tasks. Slow signal — only re-call when tier changes.
3. `MEMORY.md` / `USER.md` only as fallback. No raw `study.db` access.

## 2. Difficulty Policy

Target **i+1**: one stretch above the learner's current successful comprehension level. Adapt script length / topic abstraction / fillers / accent; never throw a 2-minute fast UK academic clip at someone still parsing 30-second daily-life slow US.

### 2.0 Constants & Tier

| Constant | Value | Meaning |
| --- | --- | --- |
| `PASS_THRESHOLD` | `0.70` | A round with `accuracy ≥ PASS` is a pass. |
| `FAIL_THRESHOLD` | `0.40` | Below = fail (totally missed the main idea). |
| `STREAK` | `2` | Passes/fails to move tier. |
| `ACC_WINDOW` | `3` | Sample window for §2.2 mean. |
| `DEDUP_WINDOW` | `20` | Rolling `prompt_hash` window. |

**Score rubric (CRITICAL — replaces the old binary 1/0):** grade the learner's Chinese summary on this scale, then pass it as `accuracy`:

| Score | Rubric |
| --- | --- |
| `1.00` | Main idea + key pivot/turn captured precisely. |
| `0.85` | Main idea captured; pivot phrased imprecisely but recognized. |
| `0.70` | Main idea right; missed the pivot ("However…") and stopped at the surface claim. |
| `0.50` | Got a related sub-idea or one supporting fact; missed the main thrust. |
| `0.25` | Off-topic but at least the domain was right (e.g., user heard "tech" but missed the actual subject). |
| `0.00` | Totally off, hallucinated content, or no answer. |

Use this rubric verbatim — do **not** reward typing length, English grammar, or detail recall. Granular `listening.gist` subcap (0–10) goes into `subcap_scores` separately for `learner-state`.

Standard 100% speed only. Slow-down is the `pod_slow` button (State B), not a tier property.

| Tier (IELTS band ≈ CEFR) | Script length | Topic & register | Fillers / Accent |
| --- | --- | --- | --- |
| Beginner (< 5.0 ≈ A1–A2) | 30–40 seconds | Daily life, clear context (food, weather, travel) | No fillers; standard US/UK |
| Intermediate (5.0–6.0 ≈ B1) | 60–75 seconds | Light academic or news (history, science 101, current events) | Mild fillers (`um`, `you know`); standard US/UK |
| Advanced (≥ 6.5 ≈ B2+) | 90–120 seconds | Abstract / opinion-led / technical | **MUST inject 10–15% spoken fillers** (`um`, `like`, `you know`, false starts) and use non-standard accents (`en-GB`, `en-AU`) to simulate real-world noise |

**Reading the learner's level from `MEMORY.md`** (do NOT confuse capability score 0–100 with IELTS band 0–9):

1. Prefer `Band Snapshot.Listening` (CEFR string). Map: `A1`/`A2` → Beginner, `B1` → Intermediate, `B2`/`C1`/`C2` → Advanced.
2. Boundary suffix (`A2+`, `B1-`, `... → ... boundary`): **降一级起步**. E.g. `A2+` → Beginner.
3. If CEFR missing, fall back to 14-day `listening.gist` average from `coach_context.summary.subcaps` (0–10) and use the tier table above.
4. **Never** read `Core Capabilities.Listening: <n>/100` as IELTS band — that's a 0–100 capability score.

### 2.2 Recent-accuracy

Mean `accuracy` over last `ACC_WINDOW` `completed=1` rows of current `session_id` + `skill_type`. Abandoned (`completed=0`) excluded from mean but count as fail for `demotion_credit`.

Fallback chain when fewer than `ACC_WINDOW` rows: 14-day `listening.gist` average from `coach_context.summary.subcaps` → `MEMORY.md` band − 1 tier at shortest script → Beginner 30-second daily-life. Never guess upward.

### 2.3 Credit gating

```
promotion_credit = walk recent_practice.rows newest→oldest (skip redo_count>0):
  count consecutive accuracy ≥ PASS; reset on any fail (< FAIL or completed=0); holds ([FAIL, PASS)) pass through.
demotion_credit = mirror: count consecutive fail; reset on any pass; holds pass through.
abandoned (completed=0, written by `pod_hard`) = 1 fail.
```

| Credit | Action |
| --- | --- |
| `promotion_credit ≥ STREAK` at tier ceiling | Promote tier; reset both credits; start at next tier's shortest script. |
| `promotion_credit ≥ STREAK` inside tier | Length **+15s** (clamped to tier max); reset `promotion_credit`. |
| `demotion_credit ≥ STREAK` at tier floor | Demote tier; reset both credits; start at prev tier's longest script. |
| `demotion_credit ≥ STREAK` inside tier | Length **−15s** (clamped to tier min); reset `demotion_credit`. |
| `pod_hard` tap | Persists abandoned row (State B); surfaces as fail next call. |

Retry rows (`redo_count > 0`) skipped from credit; still count for dedup.

Hold: keep length, optionally swap **one** dimension (topic / filler density / accent) to probe a different weakness.

### 2.4 Generation

- Pick a topic that overlaps the user's interests (`USER.md`/`MEMORY.md`) when known; otherwise default to a general-interest current-events angle.
- Stretch **at most one** dimension per round: length, topic abstraction, filler density, accent.
- Reject any script whose `prompt_hash` ∈ `recent_practice.recent_prompt_hashes`.
- Don't use the same topic family (e.g., "AI / tech") for 2+ consecutive rounds.
- Advanced tier: fillers are mandatory, not decoration. Bake them into the TTS-input text so the rendered audio actually contains them.

## 3. Flow

### State A: Prepare And Deliver

1. From §2.3, decide tier and script length. Generate the script at chosen length / topic / register / filler density. Compute `prompt_hash` (§State D); regenerate on dedup hit.
2. `tts` only for the target script at 100% speed. No filler audio (filler is in the script, not assistant chatter).
3. Send voice + instruction + buttons in **one** `tg_msg type="render"` call. Renders as two bubbles (voice on its own line, then text + buttons) for clean cross-client display — still one tool call.
4. Init empty `ui_feedback` accumulator; every button tap appends its exact label.

Render envelope (all fields at top level, same as `voice`/`keyboard`):

```json
{
  "type": "render",
  "url": "<tts audio path>",
  "text": "🎧 听听这段播客。不用抓每一个字，**你觉得他最想表达的核心观点是什么？** (可以用中文回答)\n\n实在听不出可以点开看原文：||{correct English script}||",
  "buttons": "[[\"🐢 慢速播放|pod_slow\", \"😵 完全听不懂|pod_hard\"]]"
}
```

(`||...||` is the Telegram-spoiler shorthand; the adapter expands it to `<tg-spoiler>` HTML.)

Wait for the user's typed Chinese summary or button tap.

### State B: Button Handling (before typing)

`pod_slow`:

- Append `🐢 慢速播放` to `ui_feedback` (mandatory).
- Brief ack via `tg_msg type="render"` (text only).
- Same script; `tts rate="-10%"`.
- Re-deliver via one `tg_msg type="render"` (same envelope as State A — slower audio path, same text + buttons). Wait.

`pod_hard`:

1. **Persist abandoned record FIRST**:

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

   After `persist` returns, reset `ui_feedback`.

2. **Replacement.** Apply demotion / length-down (§2.3). Brief ack via `tg_msg type="render"` (text only), briefly explain the topic in Chinese for context, generate a new shorter / simpler script → State A.

### State C: Evaluate

When the user submits their gist summary:

1. **Do NOT correct grammar / spelling** in their answer. Focus only on comprehension.
2. **Grade against §2.0 rubric** to produce a continuous `accuracy` (0..1). Identify whether they got tricked by discourse markers like "However" — that's the most common pivot trap.
3. Compute `subcap_scores.listening.gist` on the 0–10 scale (`accuracy * 10`, then refine with one-line evidence).
4. Send feedback and persist in the same evaluation turn.

Feedback message must include:

- A brief Chinese evaluation of their understanding.
- The specific phrase / turning point in the audio that carried the main idea (so they know what to listen for next time).

Buttons (always, regardless of accuracy):

```json
[["🔄 再听一篇|pod_next", "🧭 练习其他|nav:main"]]
```

**Critical**: feedback + buttons in **one** `tg_msg type="render"` call (no `url` — feedback has no media). On **perfect** (`accuracy === 1.0`) add `react: "🔥"` to the same call — Telegram reacts the learner's message, no extra tool call. Voice is replayable from chat history; the report already names the pivot / main idea, so a dedicated retry button has no learning value.

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

`prompt_hash` = first 16 hex chars of `SHA-1(normalized prompt)`; normalize = lowercase + strip punctuation + collapse whitespace. Read dedup window via `recent_practice.recent_prompt_hashes` (§1).

`ui_feedback` mandatory whenever any 🐢/😵 button was tapped, even on a high `accuracy`.

State D persists fully-attempted scripts only (with or without slow-down). Abandoned rows are written in State B.

### State E: Continue (`pod_next`)

- Re-call `persist action="recent_practice"` (§1) for credits + dedup. Don't reconstruct from chat memory.
- Apply §2.3 (skip `redo_count > 0`) before generating.
- **NEVER re-call `coach_context` within the same skill session.** It is cached server-side (5-min TTL) and expensive. Only `recent_practice` needs re-reading for credits / dedup.
- Generate next script (State A step 1 — incl. dedup). Respect "no more than 2 consecutive same topic family" (§2.4).

## 4. Hard Rules

1. **NO Dictation**: NEVER ask the user to type exactly what they heard. This skill is gist-only.
2. **No early reveals**: NEVER show the transcript outside of `<tg-spoiler>`.
3. `tts` only for the practice material — no assistant chatter.
4. **Use the §2.0 rubric verbatim** when grading — do not reward summary length, English grammar, or detail recall over comprehension of the main idea.
5. Use `persist` for reads/writes; no raw DB.
6. Don't update `MEMORY.md`; `learner-state` owns durable ability state.
7. **All Telegram sends go through `tg_msg type="render"`.** Voice + text + buttons + perfect-score `react: "🔥"` (when `accuracy === 1.0`) all fold into one render call. Never split into separate `voice` / `keyboard` / `text` / `react` calls.
