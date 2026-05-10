---
name: writing-essay
description: "Use this skill whenever the user wants to practice long-form writing — paragraph, essay, letter, chart description. MUST be used for any writing task exceeding one sentence."
---

# Writing Essay (Comprehensive Practice)

Full-length writing drill. One prompt at a time: 3-choice (or callback-forced) task, optional outline / SOS scaffolds, learner submits a complete piece, grade against the 4 IELTS criteria, polish 1–2 awkward sentences, persist, then adapt the next prompt by i+1. Slow-pace skill — credit gating uses a wider sample window.

## 1. Inputs

Trigger when:

- User says: `Write an essay`, `Write a letter`, `Task 1`, `Task 2`, `写作文`, `写信`, `图表作文`.
- User submits a paragraph or essay for grading (no preamble).
- Callback `writing-essay`.
- Planner routes here when band-snapshot for Writing has stalled and the user needs full-length practice (not just rewrite).

Required context before generating:

1. `persist {"action":"recent_practice","session_id":"<session>","skill_type":"writing.essay","limit":20}` (`limit` int). Returns rows + `recent_prompt_hashes`. Source of truth for §2.3 credit and §2.4 dedup; do not duplicate hashes in `metadata`.
2. `persist {"action":"coach_context","days":14,"limit":8}` for subcaps / errors / due tasks. Slow signal — only re-call when tier changes.
3. `MEMORY.md` / `USER.md` only as fallback. No raw `study.db` access.

## 2. Difficulty Policy

Target **i+1**: one notch above the learner's last successful band on this task family. Adapt task type (letter / chart / opinion / argumentative+counter) and word count; never combine multiple stretches in one round. Essay frequency is low (one piece can take 20–30 min), so the gating window is wider than other writing skills.

### 2.0 Constants & Tier

| Constant | Value | Meaning |
| --- | --- | --- |
| `PASS_THRESHOLD` | `6.0` | A round with `band_overall ≥ PASS` is a pass. Anchored at IELTS 6 (baseline pass). |
| `FAIL_THRESHOLD` | `5.0` | Below = fail. Wider hold band reflects half-band noise + slow frequency. |
| `STREAK` | `3` | Passes/fails to move tier — one notch higher than other writing skills because writing essays is high-effort and one outlier shouldn't move the bar. |
| `ACC_WINDOW` | `5` | Sample window for §2.2 mean — wider for the same reason. |
| `DEDUP_WINDOW` | `30` | Rolling `prompt_hash` window — wider; user shouldn't see the same prompt within ~30 attempts (≈ 4–8 weeks). |

This skill is **band-scored**, not accuracy-scored. `accuracy=NULL`. Gating signal is `band_overall`.

| Tier (current band) | Task type | Word count | Time |
| --- | --- | --- | --- |
| Beginner (≤ 5.0) | Practical letter (apology / request / complaint) — informal register, simple structure | 100–130 | 15 min |
| Pre-IELTS (5.0–5.5) | Chart / data description (Task 1 academic) OR semi-formal informational letter | 130–170 | 20 min |
| Intermediate (5.5–6.5) | One-sided opinion essay (Task 2) — clear thesis + 2 reasons | 200–250 | 25 min |
| Advanced (≥ 6.5) | Argumentative essay with counter / agree-disagree / discuss-both-views | 250–300 | 30 min |

**Reading the learner's level from `MEMORY.md`** (do NOT confuse capability score 0–100 with IELTS band 0–9):

1. Prefer `Band Snapshot.Writing` (band number like `5.5`, `6.0`).
2. Boundary suffix (`5.5-`): treat as the lower band side.
3. If band missing, fall back to 14-day `writing.task_achievement` + `writing.coherence` + `writing.lexical_range` + `writing.grammar_accuracy` mean from `coach_context.summary.subcaps`. Map the mean (0–10) to band: < 5 → Beginner; 5–6 → Pre-IELTS; 6–7 → Intermediate; ≥ 7 → Advanced.
4. **Never** read `Core Capabilities.Writing: <n>/100` as the band — that's a 0–100 capability score.

### 2.2 Recent-accuracy

Mean `band_overall` over last `ACC_WINDOW` `completed=1` rows of current `session_id` + `skill_type`. Abandoned (`completed=0`) excluded from mean but count as fail for `demotion_credit`.

Fallback chain when fewer than `ACC_WINDOW` rows: 14-day mean from `coach_context.summary` → `MEMORY.md` band − 0.5 at shortest task → Beginner practical letter. Never guess upward.

### 2.3 Credit gating

```
promotion_credit = walk recent_practice.rows newest→oldest (skip redo_count>0):
  count consecutive band_overall ≥ PASS_THRESHOLD;
  reset on any fail (band_overall < FAIL_THRESHOLD or completed=0);
  holds (5.0 ≤ band_overall < 6.0) pass through.
demotion_credit = mirror.
abandoned (completed=0) = 1 fail.
```

| Credit | Action |
| --- | --- |
| `promotion_credit ≥ STREAK` at tier ceiling | Promote tier (next row of §2.0); reset both credits. |
| `promotion_credit ≥ STREAK` inside tier | Word count **+30** (clamped to tier max) OR shift to a harder sub-format (e.g. opinion → discuss-both-views) within the same tier; reset `promotion_credit`. |
| `demotion_credit ≥ STREAK` at tier floor | Demote tier; reset both credits. |
| `demotion_credit ≥ STREAK` inside tier | Word count **−30** (clamped to tier min) or shift to easier sub-format; reset `demotion_credit`. |
| `we_easier` tap | Persists abandoned row (State B); surfaces as fail next call. |

Retry rows (`redo_count > 0`) skipped from credit; still count for dedup.

Hold: keep tier and word range; rotate task topic.

### 2.4 Generation

- Pick a topic relevant to the user's life (`USER.md` interests, work, study) when possible; otherwise rotate IELTS standard topics (education / environment / technology / society / health / work / culture / government).
- Stretch **at most one** dimension per round: word count, sub-format, topic abstraction.
- Reject any prompt whose `prompt_hash` ∈ `recent_practice.recent_prompt_hashes`.
- Don't repeat the same topic family for 3+ consecutive rounds (long memory because essay frequency is low).

## 3. Flow

### State A: Prepare And Deliver

1. From §2.3 + `coach_context`, decide tier → task type, word count, time budget.
2. Generate **one** prompt directly (no 3-choice menu — choosing wastes a full LLM round). Compute `prompt_hash`; regenerate on dedup hit.
3. **Prompt delivery** in a single `tg_msg type="keyboard"`:

   Text:

   ```text
   ✍️ {task type} · ~{word_count} 词 · ~{time} 分钟

   {prompt body}

   写好后整段直接发给我就行。
   ```

   Buttons:

   ```json
   [["💡 给我提纲|we_outline", "🆘 卡壳了|we_sos", "💡 换个简单的|we_easier"]]
   ```

4. Init empty `ui_feedback` accumulator.
5. Wait for user's essay submission.

### State B: Button Handling (before submitting)

`we_outline`:

- Append `💡 给我提纲` to `ui_feedback`.
- Provide a **3-bullet** outline in Chinese (intro thesis / body 1 / body 2 — or for letters, opening / main message / closing). Do NOT write any actual sentences.
- Re-send the same keyboard.

`we_sos`:

- Append `🆘 卡壳了` to `ui_feedback`.
- Provide a **3-word vocabulary bank** relevant to the prompt + a **sentence starter** for the introduction (one sentence opener only).
- Re-send the same keyboard.

`we_easier`:

1. **Persist abandoned record FIRST**:

   ```
   completed=0, accuracy=NULL, band_overall=NULL,
   band_task=NULL, band_coherence=NULL, band_lexical=NULL, band_grammar=NULL,
   response="",
   feedback="Learner tapped '💡 换个简单的' before writing. Treat as negative evidence at this tier/task.",
   ui_feedback="<accumulated, including 💡 换个简单的>", load_score=0, minutes=0,
   metadata={"abandoned_reason":"too_hard","tier":"<tier>","task_type":"<task>","word_count_target":<n>}
   ```

   After `persist` returns, reset `ui_feedback`.

2. **Replacement.** Apply demotion (§2.3). Brief Chinese ack, generate an easier task → State A.

If a scaffolded run (`we_outline` or `we_sos` was tapped) eventually completes, mark `metadata.scaffolded = true` so `learner-state` knows the band wasn't unaided.

### State C: Evaluate

When the learner submits their essay:

1. Compute the **model band-target version** internally (don't display it in full — too long; only quote 1–2 polished sentences). Use it as the comparison anchor.
2. Score on 4 IELTS criteria, each on the 4.0–9.0 half-band scale (no quarters — only halves):
   - `band_task` — task achievement (Task 1: data accuracy + key features; Task 2: thesis clarity + position; Letter: register + completeness).
   - `band_coherence` — paragraphing, cohesion, logical flow.
   - `band_lexical` — vocabulary range + accuracy.
   - `band_grammar` — grammatical range + accuracy.
   - `band_overall` = round(mean of 4, nearest 0.5), but capped at the lowest of the 4 + 0.5 (IELTS convention: weakest dimension drags overall).
3. Identify the **dominant error class** (article / verb form / collocation / coherence gap / task incomplete / register mismatch).
4. Pick **1–2 awkward sentences** from the user's essay and provide a Native Polish (your improved version) for each.
5. **Persist FIRST, THEN feedback**. Sequential.

Feedback message must include:

- 4 band scores in 1 line: `Task X.X · Coh X.X · Lex X.X · Gram X.X → Overall X.X`.
- The **strongest move** the user made (1 line — praise concrete, not generic).
- **1–2 Native Polish** sentences (user's original → polished version → 1-line "why" naming the rule).
- The dominant error class, with **explained why** (Hard Rule 2).

Buttons (always, regardless of band):

```json
[["✍️ 再写一篇|writing-essay", "🧭 练习其他|nav:main"]]
```

**Critical**: feedback + buttons in **one** `tg_msg type="keyboard"` call. The Native Polish sentences fit inside the same body. Never `type="text"` then `type="edit"` to attach buttons.

### State D: Persist Evidence

Call `persist` with `action="practice"` (or omit `action`).

Minimum payload:

```json
{
  "skill_type": "writing.essay",
  "session_id": "<session>",
  "prompt": "<the essay prompt as shown to the user>",
  "prompt_hash": "<sha1(normalized prompt) first 16 chars>",
  "response": "<the user's full essay text>",
  "accuracy": null,
  "band_task": 6.0,
  "band_coherence": 6.0,
  "band_lexical": 5.5,
  "band_grammar": 6.0,
  "band_overall": 5.5,
  "feedback": "<IN ENGLISH for DB / learner-state> Clear position taken with two reasons; second body paragraph wandered into a sub-claim that wasn't supported. Lexical range limited — repeated 'important' four times where 'crucial / vital / consequential' would have varied register. Grammar mostly clean; one verb-form error in a relative clause ('the people who needs').",
  "section": "writing",
  "domain": "writing",
  "load_score": 3,
  "minutes": 25,
  "mode": "study",
  "ui_feedback": "<comma-joined exact button labels tapped this round, e.g. '💡 给我提纲' — empty if none>",
  "metadata": "{\"tier\":\"intermediate\",\"task_type\":\"opinion_essay\",\"word_count_target\":250,\"word_count_actual\":238,\"topic\":\"education_policy\",\"scaffolded\":false,\"dominant_error\":\"lexical_repetition\",\"promotion_credit_after\":1,\"demotion_credit_after\":0}",
  "errors": "[{\"key\":\"verb_form_error\",\"category\":\"writing\",\"severity\":\"low\",\"original\":\"the people who needs\",\"correction\":\"the people who need\",\"note\":\"Subject-verb agreement in a relative clause: antecedent 'people' is plural, so 'need' (no -s).\"},{\"key\":\"collocation_error\",\"category\":\"writing\",\"severity\":\"medium\",\"original\":\"important important important\",\"correction\":\"crucial / vital / consequential\",\"note\":\"Repeated the same lexical item four times where varied higher-band synonyms would lift the band.\"}]",
  "subcap_scores": "[{\"key\":\"writing.argument_depth\",\"score\":6.0,\"evidence\":\"Position clear; second support unfocused.\"},{\"key\":\"writing.cohesion\",\"score\":6.0,\"evidence\":\"Paragraph breaks logical; transitions between body paragraphs thin.\"},{\"key\":\"writing.lexical_range\",\"score\":5.5,\"evidence\":\"Repeated 'important' four times.\"},{\"key\":\"writing.grammar_accuracy\",\"score\":6.0,\"evidence\":\"One verb-form slip in a relative clause; otherwise clean.\"}]"
}
```

`prompt_hash` = first 16 hex chars of `SHA-1(normalized prompt)`; normalize = lowercase + strip punctuation + collapse whitespace.

`ui_feedback` mandatory if any button was tapped. `metadata.scaffolded` mandatory whenever `we_outline` or `we_sos` was tapped.

State D persists fully-attempted essays only. Abandoned rows are written in State B.

### State E: Continue (`writing-essay`)

- Re-call `persist action="recent_practice"` (§1) for credits + dedup.
- Apply §2.3 (skip `redo_count > 0`) before generating.
- **NEVER re-call `coach_context` within the same skill session.** It is cached server-side (5-min TTL) and expensive. Only `recent_practice` needs re-reading for credits / dedup.
- Generate next prompt (State A — incl. dedup). Respect "no same topic family for 3+ consecutive rounds" (§2.4).

## 4. Collaborates With

- `planner`: routes here when long-form writing has stalled and the user needs full-length practice.
- `learner-state`: reads persisted band evidence; updates `MEMORY.md` band snapshot.
- `planner`: (proactive nudge) uses 4-axis subcap scores to explain which dimension is the bottleneck.
- `writing-rewrite`: handoff target after a low-band essay — pick one paragraph and rewrite it as the next round.
- `writing-builder`: handoff for sentence-level mechanics if grammar errors dominate.
- `vocab-harvest` / `vocab-review`: optional auto-call when the Native Polish introduces a teachable chunk.
- `support/data-contract`: defines the `persist` write protocol.

## 5. Failure And Fallbacks

- User submits less than 70% of target word count → grade per submitted text but flag `metadata.coverage="under"`. Lexical / cohesion bands cap at -0.5 below what the text alone would warrant.
- User submits in mixed Chinese / English → ask once for an English-only redo; if user insists, grade English-only portion and flag `metadata.mixed_language=true`.
- User submits a piece that doesn't address the prompt (off-topic) → `band_task` capped at 4.0; explain why in feedback.
- User doesn't respond for >30 min → no auto-fail; user is composing. Wait. After 24h with no submit, write `completed=0` if asked.
- `persist` fails → still send feedback, but say it was not saved.
- User asks for a full sample mid-writing → refuse the first time (Hard Rule 3 — progressive hinting); only after they've attempted at least the introduction will you provide one.

## 6. Hard Rules

1. **Coach, not strict examiner.** Praise one concrete strength before correcting errors. Generic "good job" doesn't count.
2. **Explain the why** of every grammar correction. Naming the rule (subject-verb agreement; conditional inversion; etc.) is the lesson.
3. **Progressive hinting.** Never write the entire essay for the user. SOS gives 3 words + a starter. Outline gives 3 bullets, no sentences. Only after a real attempt may you provide a model paragraph (and even then, one paragraph, not the whole piece).
4. **All 4 bands always reported** — task, coherence, lexical, grammar — plus overall. Never collapse to "around 6".
5. **Native Polish is mandatory** — 1–2 sentences from the user's text, polished, with the rule named.
6. **Scaffolded runs get `metadata.scaffolded = true`.** A 6.5 with outline + SOS is not the same as a 6.5 unaided; learner-state must know.
7. Use `persist` for reads/writes; no raw DB.
8. Don't update `MEMORY.md`; `learner-state` owns durable ability state.
9. **One-call keyboard.** Feedback + buttons go out in a single `tg_msg type="keyboard"` call. Never `type="text"` then `type="edit"` to attach buttons.
