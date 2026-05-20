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

Target **i+1**: one notch above the learner's last successful band on this task family. Adapt task type (letter / chart / opinion / argumentative+counter) and word count; never combine multiple stretches in one round.

### 2.0 Constants & Tier

| Constant | Value | Meaning |
| --- | --- | --- |
| `PASS_MARGIN` | `+0.0` | Pass when `band_overall ≥ baseline_band`. |
| `FAIL_MARGIN` | `−1.0` | Fail when `band_overall ≤ baseline_band − 1.0`. |
| `STREAK` | `3` | Passes/fails to move tier. |
| `ACC_WINDOW` | `5` | Sample window for §2.2 mean. |
| `DEDUP_WINDOW` | `30` | Rolling `prompt_hash` window (~4–8 weeks). |

`baseline_band` = mean `band_overall` over last 5 completed essays, else `Band Snapshot.Writing` from MEMORY.md, else 5.0 cold-start.

Band-scored, not accuracy-scored. `accuracy=NULL`. Gating signal is `band_overall` vs `baseline_band`.

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
baseline = mean(band_overall) over last 5 completed rows
          ?? Band Snapshot.Writing
          ?? 5.0

promotion_credit = walk recent_practice.rows newest→oldest (skip rows with parent_sample_id IS NOT NULL):
  count consecutive band_overall ≥ baseline + PASS_MARGIN;
  reset on any fail (band_overall ≤ baseline + FAIL_MARGIN or completed=0);
  holds (in between) pass through.
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

Redo rows (`parent_sample_id IS NOT NULL`) skipped from credit; still count for dedup.

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
3. **Prompt delivery** in a single `tg_msg type="render"` (text + buttons, no `url`):

   `text`:

   ```text
   ✍️ {task type} · ~{word_count} 词 · ~{time} 分钟

   {prompt body}

   写好后整段直接发给我就行。
   ```

   `buttons`:

   ```json
   [["💡 给我提纲|we_outline", "🆘 卡壳了|we_sos", "💡 换个简单的|we_easier"]]
   ```

4. Init empty `metadata.button_taps` accumulator.
5. Wait for user's essay submission.

### State B: Button Handling (before submitting)

`we_outline`:

- Append `💡 给我提纲` to `metadata.button_taps`.
- Provide a **3-bullet** outline in Chinese (intro thesis / body 1 / body 2 — or for letters, opening / main message / closing). Do NOT write any actual sentences.
- Re-send the same keyboard.

`we_sos`:

- Append `🆘 卡壳了` to `metadata.button_taps`.
- Provide a **3-word vocabulary bank** relevant to the prompt + a **sentence starter** for the introduction (one sentence opener only).
- Re-send the same keyboard.

`we_easier`:

1. **Persist abandoned record FIRST**:

   ```
   completed=0, accuracy=NULL, band_overall=NULL, response="[abandoned]",
   feedback="Learner tapped '💡 换个简单的' before writing. Treat as negative evidence at this tier/task.",
   assistance_level="redo", minutes=0,
   metadata={"abandoned_reason":"too_hard","tier":"<tier>","task_type":"<task>","word_count_target":<n>,"button_taps":["💡 换个简单的"]}
   ```

2. **Replacement.** Apply demotion (§2.3). Brief Chinese ack, generate an easier task → State A.

If a scaffolded run (`we_outline` or `we_sos` was tapped) eventually completes, mark `metadata.scaffolded = true` so `learner-state` knows the band wasn't unaided.

### State C: Evaluate

When the learner submits their essay:

1. Compute the **model band-target version** internally (don't display it in full — too long; only quote 1–2 polished sentences). Use it as the comparison anchor.
2. Score 4 IELTS sub-dimensions on the 0–10 canonical scale (mapped from the 4.0–9.0 half-band scale: band 5.0 ≈ 5.0/10, band 6.5 ≈ 6.5/10, etc.). Write them as **subcap rows**, not as `samples.band_*` columns (those columns were removed in schema v3):
   - `writing.task_achievement` — Task 1: data accuracy + key features; Task 2: thesis clarity + position; Letter: register + completeness.
   - `writing.cohesion` — paragraphing, cohesion, logical flow.
   - `writing.lexical_range` — vocabulary range + accuracy.
   - `writing.grammar_accuracy` — grammatical range + accuracy.
   - `samples.band_overall` = round(mean of 4, nearest 0.5), but capped at the lowest of the 4 + 0.5 (IELTS convention: weakest dimension drags overall). This is the only band column persisted on `samples`.
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

**Critical**: feedback + buttons in **one** `tg_msg type="render"` call (no `url` — feedback has no media). The Native Polish sentences fit inside the same body. On **perfect** (`accuracy === 1.0`) add `react: "🔥"` to the same call.

### State D: Persist Evidence

Call `persist` with `action="practice"` (or omit `action`).

Minimum payload:

```json
{
  "skill_type": "writing.essay",
  "session_id": "<session>",
  "prompt": "<the essay prompt as shown to the user>",
  "prompt_hash": "<sha1(normalized prompt) first 12 hex chars>",
  "response": "<the user's full essay text>",
  "accuracy": null,
  "band_overall": 5.5,
  "feedback": "<IN ENGLISH for DB / learner-state> Clear position taken with two reasons; second body paragraph wandered into a sub-claim that wasn't supported. Lexical range limited — repeated 'important' four times where 'crucial / vital / consequential' would have varied register. Grammar mostly clean; one verb-form error in a relative clause ('the people who needs').",
  "section": "writing",
  "minutes": 25,
  "mode": "study",
  "assistance_level": "<none if no scaffold; otherwise outline | sos>",
  "metadata": "{\"tier\":\"intermediate\",\"task_type\":\"opinion_essay\",\"word_count_target\":250,\"word_count_actual\":238,\"topic\":\"education_policy\",\"dominant_error\":\"lexical_repetition\",\"button_taps\":[]}",
  "errors": "[{\"key\":\"verb_form_error\",\"category\":\"writing\",\"severity\":\"low\",\"original\":\"the people who needs\",\"correction\":\"the people who need\",\"note\":\"Subject-verb agreement in a relative clause: antecedent 'people' is plural, so 'need' (no -s).\"},{\"key\":\"collocation_error\",\"category\":\"writing\",\"severity\":\"medium\",\"original\":\"important important important\",\"correction\":\"crucial / vital / consequential\",\"note\":\"Repeated the same lexical item four times.\"}]",
  "subcap_scores": "[{\"key\":\"writing.task_achievement\",\"value\":6.0,\"evidence\":\"Position clear; second support unfocused.\"},{\"key\":\"writing.cohesion\",\"value\":6.0,\"evidence\":\"Paragraph breaks logical; transitions between body paragraphs thin.\"},{\"key\":\"writing.lexical_range\",\"value\":5.5,\"evidence\":\"Repeated 'important' four times.\"},{\"key\":\"writing.grammar_accuracy\",\"value\":6.0,\"evidence\":\"One verb-form slip in a relative clause; otherwise clean.\"}]"
}
```

`prompt_hash` = first 12 hex chars of `SHA-1(normalized prompt)`; normalize = lowercase + strip punctuation + collapse whitespace.

`assistance_level` is the canonical scaffold signal. Use `outline` if `we_outline` was tapped, `sos` if `we_sos`. Both → use `sos` (the heavier scaffold wins). Button-tap labels can be appended to `metadata.button_taps` for telemetry but they don't drive learner-state.

State D persists fully-attempted essays only. Abandoned rows are written in State B.

### State D.5: Inline remediation handoff

When the persisted band is demote-tier territory (`band_overall ≤ baseline_band + FAIL_MARGIN`) OR the dominant error class is `cohesion` / `lexical` / `grammar` rather than `task_incomplete`, append ONE remediation button to the State D feedback message:

| Symptom | Button (label\|callback) |
|---------|--------------------------|
| Lexical / cohesion / argument depth dominant | `🪄 改写薄弱段\|writing-rewrite` |
| Grammar dominant (verb form / agreement / fragments) | `🔧 语法补练\|writing-builder` |
| Task incomplete / weak position | (no button — coach inline in feedback) |

Before sending, write the handoff intent onto the just-persisted sample via `metadata.followup`:

```json
"metadata": "{...,\"followup\":{\"target\":\"writing-rewrite\",\"reason\":\"lexical_repetition_in_para_2\",\"focus_excerpt\":\"<the weakest paragraph, verbatim>\"}}"
```

`writing-rewrite` / `writing-builder`, on their first turn after this handoff, read the most recent `writing.essay` row from `recent_practice`, decode `metadata.followup`, and use `focus_excerpt` as the source paragraph. One button per essay — don't stack.

### State E: Continue (`writing-essay`)

- Re-call `persist action="recent_practice"` (§1) for credits + dedup.
- Apply §2.3 before generating.
- **NEVER re-call `coach_context` within the same skill session.** It is cached server-side (5-min TTL) and expensive. Only `recent_practice` needs re-reading for credits / dedup.
- Generate next prompt (State A — incl. dedup). Respect "no same topic family for 3+ consecutive rounds" (§2.4).

## 4. Collaborates With

- `planner`: routes here when long-form writing has stalled and the user needs full-length practice.
- `learner-state`: reads persisted band evidence; updates `MEMORY.md` band snapshot.
- `writing-rewrite`: handoff target after a low-band essay — pick one paragraph and rewrite it as the next round.
- `writing-builder`: handoff for sentence-level mechanics if grammar errors dominate.
- `vocab-harvest` / `vocab-review`: optional auto-call when the Native Polish introduces a teachable chunk.
- `support/data-contract`: defines the `persist` write protocol.

## 5. Failure And Fallbacks

- User submits less than 70% of target word count → grade per submitted text but flag `metadata.coverage="under"`. Lexical / cohesion bands cap at -0.5 below what the text alone would warrant.
- User submits in mixed Chinese / English → ask once for an English-only redo; if user insists, grade English-only portion and flag `metadata.mixed_language=true`.
- User submits a piece that doesn't address the prompt (off-topic) → `writing.task_achievement` subcap capped at 4.0 and `band_overall` reduced accordingly; explain why in feedback.
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
9. **All Telegram sends go through `tg_msg type="render"`.** Prompt delivery + buttons, scaffolds (`we_outline` / `we_sos` / `we_easier`), feedback + buttons + perfect-score `react: "🔥"` all fold into render calls. Never split into separate `text` / `keyboard` / `react` calls.
