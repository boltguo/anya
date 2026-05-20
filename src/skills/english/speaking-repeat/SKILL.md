---
name: speaking-repeat
description: "Listen-then-retell. Play a clip ONCE, learner retells in their own words. Trains short-term holding + spontaneous phrasing."
---

# Speaking Repeat (Listen-Then-Retell)

Hear once, hold the meaning, paraphrase.

## 1. Inputs

Trigger when:

- User says: `复述`, `retell`, `听一段再说`.
- Callback `speaking-repeat`.
- Planner routes here when `speaking.interaction` or `speaking.lexical_variety` is weak, or Part 2 narrative structure is weak (5-element coverage < 3/5).

Required context before generating:

1. `persist {"action":"recent_practice","session_id":"<session>","skill_type":"speaking.repeat","limit":20}` (`limit` int, not `"DEDUP_WINDOW"` string — `Number()` would NaN it). Returns rows with `accuracy` (rubric 0..1), `prompt_hash`, decoded `metadata` (incl. `button_taps`) + flat `recent_prompt_hashes`. Source of truth for §2.3 credit and §2.4 dedup.
2. `persist {"action":"coach_context","days":14,"limit":8}` for subcaps / errors / due paraphrase patterns. Slow signal — only re-call when tier changes.
3. `MEMORY.md` / `USER.md` only as fallback. No raw `study.db` access.

## 2. Difficulty Policy

Target **i+1**: one stretch above the learner's current successful retell. Adapt source length / register / structural complexity; never throw a 150-word abstract monologue at someone still consolidating 50-word anecdotes.

### 2.0 Constants & Tier

| Constant | Value | Meaning |
| --- | --- | --- |
| `PASS_THRESHOLD` | `0.70` | A round with `accuracy ≥ PASS` is a pass. |
| `FAIL_THRESHOLD` | `0.40` | Below = fail (lost the main idea). |
| `STREAK` | `2` | Passes/fails to move tier / length. |
| `ACC_WINDOW` | `3` | Sample window for §2.2 mean. |
| `DEDUP_WINDOW` | `20` | Rolling `prompt_hash` window. |

**Score rubric (CRITICAL):** grade the learner's voice retell on this scale, then pass it as `accuracy`:

| Score | Rubric |
| --- | --- |
| `1.00` | All key info kept, paraphrased naturally — not parroting source wording. |
| `0.85` | Most key info kept; minor supporting detail lost. |
| `0.70` | Main idea kept; missed 1–2 key details or got the pivot phrased imprecisely. |
| `0.50` | Main idea right but stripped of supporting facts; or partial parroting. |
| `0.25` | Off-topic but at least the domain was right (e.g., source about a movie → retell mentions movies generally). |
| `0.00` | Totally off, hallucinated content, no answer, or answered in Chinese. |

Use this rubric verbatim — do **not** reward fluency, English grammar, or wording closeness to source. Granular `speaking.lexical_variety` and `speaking.interaction` (0–10) go into `subcap_scores` separately.

Standard 100% speed only. **Source plays once only — no slow-down button.** Hard escape only.

| Tier (IELTS band ≈ CEFR) | Source length | Register | Structure |
| --- | --- | --- | --- |
| Beginner (< 5.0 ≈ A1–A2) | 2–3 simple sentences (20–40 words) | Spoken-friendly daily life | Single anecdote, linear |
| Lower-Intermediate (5.0–5.5 ≈ B1) | Short anecdote (50–80 words) | Mixed daily / light tech / hobby | 2–3 events, light pivot |
| Upper-Intermediate (6.0 ≈ B1+/B2) | 1-paragraph excerpt (80–120 words) | News / opinion / mid-tech | 1 clear pivot ("but…", "however…") |
| Advanced (≥ 6.5 ≈ B2+) | Monologue with comparison / hypothetical (120–160 words) | Abstract / opinion-led | Comparison, conditional, multi-clause |

**Reading the learner's level from `MEMORY.md`** (do NOT confuse capability score 0–100 with IELTS band 0–9):

1. Prefer `Band Snapshot.Speaking` (CEFR string). Map: `A1`/`A2` → Beginner, `B1` → Lower-Intermediate (and `B1+` → Upper-Intermediate), `B2`/`C1`/`C2` → Advanced.
2. Boundary suffix (`A2+`, `B1-`, `... → ... boundary`): **降一级起步**. E.g. `A2+` → Beginner, `B1-` → Beginner.
3. If CEFR missing, fall back to 14-day `speaking.interaction` average from `coach_context.summary.subcaps` and use the tier table above.
4. **Never** read `Core Capabilities.Speaking: <n>/100` as IELTS band — that's a 0–100 capability score.

### 2.2 Recent-accuracy

Mean `accuracy` over last `ACC_WINDOW` `completed=1` rows of current `session_id` + `skill_type`. Abandoned (`completed=0`) excluded from mean but count as fail for `demotion_credit`.

Fallback chain when fewer than `ACC_WINDOW` rows: 14-day `speaking.interaction` mean from `coach_context.summary` → `MEMORY.md` band − 1 tier at min length → Beginner min (20 words). Never guess upward.

### 2.3 Credit gating

```
promotion_credit = walk recent_practice.rows newest→oldest (skip rows with parent_sample_id IS NOT NULL):
  count consecutive accuracy ≥ PASS; reset on any fail (< FAIL or completed=0); holds ([FAIL, PASS)) pass through.
demotion_credit = mirror: count consecutive fail; reset on any pass; holds pass through.
abandoned (completed=0, written by `repeat_hard`) = 1 fail.
```

| Credit | Action |
| --- | --- |
| `promotion_credit ≥ STREAK` at tier ceiling | Promote tier; reset both credits; start at next tier's min length. |
| `promotion_credit ≥ STREAK` inside tier | Length **+15 words** (clamped to tier max); reset `promotion_credit`. |
| `demotion_credit ≥ STREAK` at tier floor | Demote tier; reset both credits; start at prev tier's max length. |
| `demotion_credit ≥ STREAK` inside tier | Length **−15 words** (clamped to tier min); reset `demotion_credit`. |
| `repeat_hard` tap | Persists abandoned row (State B); surfaces as fail next call. |

Redo rows (`parent_sample_id IS NOT NULL`) skipped from credit; still count for dedup.

Hold: keep length, optionally swap **one** dimension (register / structure / pivot type) to probe a different weakness from `coach_context.summary.errors`.

### 2.4 Generation

- Pick **one** stretch dimension per round: length, register, structural complexity, pivot density.
- Reject any source whose `prompt_hash` ∈ `recent_practice.recent_prompt_hashes`.
- Don't reuse the same speech-act register (anecdote / news / opinion) for 2+ consecutive rounds.
- **Topic rotation**: alternate work themes (frontend, AI tools, remote-work English, interview scenarios) with the learner's hobbies in `USER.md` (films, games, anime, comedy variety). Do not default every source to coding/AI just because the learner works in tech.

## 3. Flow

### State A: Prepare And Deliver

1. From §2.3 + §2.4, decide tier, source length, topic (rotate). Generate the source passage at chosen length / register / structure. Compute `prompt_hash` (§State D); regenerate on dedup hit.
2. `tts` only for the target source at 100% speed. No filler audio.
3. Send voice + instruction + buttons in **one** `tg_msg type="render"` call. Renders as two bubbles (voice + text-with-buttons) for clean cross-client display — still one tool call.
4. Init empty `metadata.button_taps` accumulator; every button tap appends its exact label.

Render envelope:

```json
{
  "type": "render",
  "url": "<tts audio path>",
  "text": "🎧 听完一次就够。**用你自己的话**把重点说出来（按住录音键）。\n\n听不懂可以点开看原文：||{correct English source}||",
  "buttons": "[[\"😵 听不懂，换一段|repeat_hard\"]]"
}
```

(Single button — no slow button, see §2.0. `||...||` is the Telegram-spoiler shorthand.)

Wait for the user's voice retell (or text fallback) or button tap.

### State B: Button Handling (before retelling)

`repeat_hard`:

1. **Persist abandoned record FIRST**:

   ```json
   {
     "action": "practice",
     "skill_type": "speaking.repeat",
     "session_id": "<session>",
     "completed": 0,
     "accuracy": 0,
     "prompt": "<the original source that was abandoned>",
     "prompt_hash": "<sha1(normalized prompt) first 12 hex chars>",
     "response": "[abandoned]",
     "feedback": "Learner tapped '听不懂' before retelling. Treat as strong negative evidence at the current tier.",
     "audio_path": "<tts file path of the abandoned audio>",
     "section": "speaking",
     "minutes": 0,
     "mode": "study",
     "metadata": "{\"abandoned_reason\":\"couldnt_catch\",\"tier\":\"<beginner|...|advanced>\",\"source_words\":<n>}"
   }
   ```

   After `persist` returns, reset `metadata.button_taps`.

2. **Replacement.** Apply demotion / length-down (§2.3). Brief ack via `tg_msg type="render"` (text only), briefly preview the topic in Chinese for context, generate a new shorter / simpler source → State A.

### State C: Evaluate

When the user submits a voice retell:

1. Transcribe the audio (whisper-style speech-to-text). Text fallback (typed retell) accepted with the same rubric — see Hard Rule 8.
2. Compute info overlap: list source's key info points (3–5 items), mark each as `kept` / `paraphrased` / `lost` / `hallucinated`.
3. **Grade against §2.0 rubric** to produce a continuous `accuracy` (0..1). Do NOT score against wording closeness — paraphrase is the goal.
4. If `coach_context.summary` flags `speaking.pronunciation_intelligibility` as weak, optionally call `pron_assess` (`granularity=Word`) and add `subcap_scores.speaking.fluency`. Otherwise skip — this skill is comprehension-driven (see `speaking-azure-score` "Only if pronunciation flagged weak").
5. Identify 1 high-value upgrade: original phrase → upgraded version → reason. Auto-harvest the upgrade chunk for vocab review.
6. **Persist FIRST, THEN feedback.** Sequential — the row must be in DB before feedback reaches the learner.

Feedback content (no fixed header/template) — every reply MUST cover, in some natural form:

- the rubric score (e.g. `🎯 信息完整度: 0.70/1.0 — 主旨抓住，漏了 1-2 个关键细节`)
- the **kept / lost** breakdown — name what they kept and what slipped
- the source revealed via `<tg-spoiler>{correct English source}</tg-spoiler>` + 1-line Chinese translation
- one **upgrade** (原句 → 升级版 → 原因) — tied to the kept-but-imprecise points

Two to four sentences after the score line, conversational.

Buttons (always, regardless of accuracy):

```json
[["🔄 再来一段|repeat_next", "🧭 练习其他|nav:main"]]
```

**Critical**: feedback + buttons in **one** `tg_msg type="render"` call (no `url` — feedback has no media). On **perfect** (`accuracy === 1.0`) add `react: "🔥"` to the same call. Source audio is replayable from chat history (the rule is "no replay before retell" — after grading, reveal is fine), so no dedicated retry button.

**Micro drill (optional, same call)**: ask the learner to use the upgrade in one new sentence in the next turn (no separate persist; harvest goes via `errors` / `subcap_scores.evidence`).

### State D: Persist Evidence

Call `persist action="practice"` (or omit `action`) **before** sending the State C feedback `tg_msg`.

Minimum payload:

```json
{
  "skill_type": "speaking.repeat",
  "session_id": "<session>",
  "prompt": "<correct source passage>",
  "prompt_hash": "<sha1(normalized prompt) first 12 hex chars>",
  "response": "<transcription of user's retell>",
  "accuracy": 0.70,
  "raw_score": 0.70,
  "max_score": 1,
  "feedback": "<IN ENGLISH: kept/lost breakdown + 1 upgrade. e.g. 'Kept main idea; lost the pivot at \"however\". Upgrade: \"and then\" → \"yet\". Reason: contrast marker for B2.'>",
  "audio_path": "<tts file path of the source>",
  "section": "speaking",
  "minutes": 2,
  "mode": "study",
  "metadata": "{\"tier\":\"intermediate\",\"source_words\":80,\"register\":\"anecdote\",\"info_points_total\":4,\"info_points_kept\":3,\"promotion_credit_after\":1,\"demotion_credit_after\":0}",
  "errors": "[{\"key\":\"info_loss\",\"category\":\"speaking\",\"severity\":\"medium\",\"original\":\"\",\"correction\":\"however\",\"note\":\"Lost the contrast pivot; missed the speaker's reversal.\"},{\"key\":\"paraphrase_parroting\",\"category\":\"speaking\",\"severity\":\"low\",\"note\":\"Echoed the source's exact wording instead of paraphrasing.\"}]",
  "subcap_scores": "[{\"key\":\"speaking.interaction\",\"score\":7.0,\"evidence\":\"Captured main idea; missed pivot.\"},{\"key\":\"speaking.lexical_variety\",\"score\":6.0,\"evidence\":\"Reused source words instead of paraphrasing.\"}]"
}
```

`prompt_hash` = first 12 hex chars of `SHA-1(normalized prompt)`; normalize = lowercase + strip punctuation + collapse whitespace. Read dedup window via `recent_practice.recent_prompt_hashes` (§1).

`metadata.button_taps` mandatory whenever any 😵 button was tapped, even on `accuracy=1.0`.

State D persists fully-attempted retells only. Abandoned rows are written by State B.

If `pron_assess` was called (§State C step 4), add `band_pronunciation` field and one `speaking.fluency` subcap entry.

Error keys: `info_loss`, `paraphrase_parroting`, `register_mismatch`, `register_too_formal`, `register_too_casual`, `verb_form_error`, `l1_transfer`. Plus pronunciation taxonomy from `speaking-azure-score` if `pron_assess` was called.

### State E: Continue (`repeat_next`)

- Re-call `persist action="recent_practice"` (§1) for credits + dedup. Don't reconstruct from chat memory.
- Apply §2.3 before generating.
- **NEVER re-call `coach_context` within the same skill session.** It is cached server-side (5-min TTL) and expensive. Only `recent_practice` needs re-reading for credits / dedup.
- Generate next source (State A step 1 — incl. dedup, topic rotation per §2.4). Respect "no more than 2 consecutive same register" (§2.4).

## 4. Collaborates With

- `planner`: routes here when `speaking.interaction` / paraphrasing / Part-2 structure is the highest-value drill.
- `learner-state`: reads persisted evidence, computes long-running retell ability, updates `MEMORY.md`.
- `planner`: (proactive nudge) uses errors/subcap scores to explain paraphrase patterns and pivot detection.
- `vocab-harvest`: turns auto-harvested upgrades into review items.
- `speaking-azure-score`: optional `pron_assess` if pronunciation flagged weak.
- `support/data-contract`: defines the `persist` write protocol.

## 5. Failure And Fallbacks

- `tts` fails → text error, no fake `audio_path`. Offer retry / menu.
- Transcription fails → ask the user to type the retell (Hard Rule 8 — text fallback accepted).
- `persist` fails → still send feedback, but say it was not saved.
- `<tg-spoiler>` is client-side; no callback. Don't invent `spoiler_used`.
- Empty / inaudible audio → ask once: replay (no — rule 1) / `repeat_hard` / skip. If skipped, `completed=0`.

## 6. Hard Rules

1. **Play once only.** Replay defeats the drill. State A delivers source ONCE; reveal happens in State C after the retell.
2. **Hide source until after retell**: never show the transcript outside `<tg-spoiler>`.
3. **All Telegram sends go through `tg_msg type="render"`.** Voice + text + buttons + perfect-score `react: "🔥"` (when `accuracy === 1.0`) all fold into one render call. Never split into separate `voice` / `text` / `keyboard` / `react` calls.
4. Use `persist` for reads/writes; no raw DB.
5. Don't update `MEMORY.md`; `learner-state` owns durable ability state.
6. **Measure retention, not wording.** Score against the §2.0 rubric — paraphrase scored as high as parroting, parroting scored LOWER if it echoes source verbatim without comprehension.
7. **One upgrade per session.** Don't list 5 corrections — pick the highest-leverage one and harvest it.
8. **Text fallback accepted.** Voice preferred but typed retells score under the same rubric — don't penalize the modality.
