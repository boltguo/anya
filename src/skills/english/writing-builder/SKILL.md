---
name: writing-builder
description: "MUST trigger when the user wants to practice basic writing mechanics, building sentences, grammar drills, or writing short paragraphs from outlines."
---

# Writing Builder (Micro-level Syntax Gym)

Sentence-level grammar gym. One micro-task at a time: deliver a constraint (use "Despite" + a target word, or combine 2 short sentences with a relative clause), let the learner type their attempt, evaluate against the constraint **and** native polish, persist, then adapt the next prompt by i+1.

## 1. Inputs

Trigger when:

- User says: `造句`, `grammar drill`, `build sentences`, `练习写长句`.
- Callback `writing-builder`.
- Planner routes here for weak `writing.grammar_accuracy` / `writing.cohesion` / repeated `verb_form_error` / `sentence_fragment` / `run_on_sentence`.

Required context before generating:

1. `persist {"action":"recent_practice","session_id":"<session>","skill_type":"writing.builder","limit":20}` (`limit` int). Returns rows + `recent_prompt_hashes`. Source of truth for §2.3 credit and §2.4 dedup; do not duplicate hashes in `metadata`.
2. `persist {"action":"coach_context","days":14,"limit":8}` for subcaps / errors / due grammar items. Slow signal — only re-call when tier changes.
3. `MEMORY.md` / `USER.md` only as fallback. No raw `study.db` access.

## 2. Difficulty Policy

Target **i+1**: one structural stretch above the learner's last successful attempt. Adapt connector / clause type / vocab band; never combine two stretches in one round.

### 2.0 Constants & Tier

| Constant | Value | Meaning |
| --- | --- | --- |
| `PASS_THRESHOLD` | `0.80` | A round with `accuracy ≥ PASS` is a pass. |
| `FAIL_THRESHOLD` | `0.60` | Below = fail; `[FAIL, PASS)` = "hold". |
| `STREAK` | `2` | Passes/fails to move structure / tier. |
| `ACC_WINDOW` | `3` | Sample window for §2.2 mean. |
| `DEDUP_WINDOW` | `20` | Rolling `prompt_hash` window. |

**Score rubric (use verbatim — typed answer is rated 0..1, not binary):**

| Score | Rubric |
| --- | --- |
| `1.00` | Constraint met, grammar clean, phrasing native. |
| `0.85` | Constraint met, grammar clean, phrasing slightly awkward (Native Polish still required). |
| `0.70` | Constraint met but one minor grammar issue (article / plural / preposition). |
| `0.50` | Constraint partially met (e.g. used connector but wrong clause structure) or one major grammar error. |
| `0.25` | Attempted but dodged the constraint (rephrased to avoid it). |
| `0.00` | No answer / abandoned / answered in Chinese. |

Native Polish is **always required** even at 1.00 (see Hard Rule 2). It is not part of the score.

| Tier (IELTS band ≈ CEFR) | Constraint type | Vocab band |
| --- | --- | --- |
| Beginner (< 5.0 ≈ A1–A2) | SVO translation, or join 2 clauses with `and / but / so` | A1–A2 (high-frequency only) |
| Intermediate (5.0–6.0 ≈ B1) | Specific connectors (`Although`, `Despite`, `Even though`) or relative clauses (`which`, `who`, `where`) | A2–B1 |
| Advanced (≥ 6.5 ≈ B2+) | Inversion, participle clauses, nominalization, cleft sentences | B1–B2+ |

**Reading the learner's level from `MEMORY.md`** (do NOT confuse capability score 0–100 with IELTS band 0–9):

1. Prefer `Band Snapshot.Writing` (CEFR string). Map: `A1`/`A2` → Beginner, `B1` → Intermediate, `B2`/`C1`/`C2` → Advanced.
2. Boundary suffix (`A2+`, `B1-`): **降一级起步**.
3. If CEFR missing, fall back to 14-day `writing.grammar_accuracy` / `writing.cohesion` average from `coach_context.summary.subcaps` (0–10) and use the tier table above.
4. **Never** read `Core Capabilities.Writing: <n>/100` as the IELTS band — that's a 0–100 capability score.

### 2.2 Recent-accuracy

Mean `accuracy` over last `ACC_WINDOW` `completed=1` rows of current `session_id` + `skill_type`. Abandoned (`completed=0`) excluded from mean but count as fail for `demotion_credit`.

Fallback chain when fewer than `ACC_WINDOW` rows: 14-day mean from `coach_context.summary` → `MEMORY.md` band − 1 tier at simplest constraint → Beginner SVO. Never guess upward.

### 2.3 Credit gating

```
promotion_credit = walk recent_practice.rows newest→oldest (skip rows with parent_sample_id IS NOT NULL):
  count consecutive accuracy ≥ PASS; reset on any fail (< FAIL or completed=0); holds ([FAIL, PASS)) pass through.
demotion_credit = mirror: count consecutive fail; reset on any pass; holds pass through.
abandoned (completed=0) = 1 fail.
```

| Credit | Action |
| --- | --- |
| `promotion_credit ≥ STREAK` at tier ceiling | Promote tier; reset both credits; start at next tier's simplest constraint. |
| `promotion_credit ≥ STREAK` inside tier | Swap to a harder constraint within the same tier; reset `promotion_credit`. |
| `demotion_credit ≥ STREAK` at tier floor | Demote tier; reset both credits; start at prev tier's hardest constraint. |
| `demotion_credit ≥ STREAK` inside tier | Swap to an easier constraint within the same tier; reset `demotion_credit`. |
| `wb_easier` tap | Persists abandoned row (State B); surfaces as fail next call. |

Redo rows (`parent_sample_id IS NOT NULL`) skipped from credit; still count for dedup.

Hold: keep tier and constraint family; swap target word / vocab to probe the same structure with a different lexical load.

### 2.4 Generation

- Pick **one** target weakness from `coach_context.summary.errors|subcaps` (e.g. `verb_form_error`, `sentence_fragment`, missing relative clause).
- Stretch **at most one** dimension per round: connector / clause type / vocab band.
- Reject any prompt whose `prompt_hash` ∈ `recent_practice.recent_prompt_hashes`.
- Don't repeat the same connector for 2+ consecutive rounds.

## 3. Flow

### State A: Prepare And Deliver

1. From `coach_context` + §2.3 credits, decide: tier, target structure, target word(s), expected subcaps.
2. Generate the micro-task (e.g. "用 `Despite` 和 `fluctuate` 把这两句话连起来：The economy is recovering. Energy prices are rising fast."). Compute `prompt_hash`; regenerate on dedup hit.
3. Send a single `tg_msg type="render"` call (text + buttons, no `url`):

   `text`:

   ```text
   ✍️ {micro-task in Chinese, with target words bolded and 2 source clauses}
   ```

   `buttons`:

   ```json
   [["🆘 我卡壳了|wb_sos", "💡 换个简单的|wb_easier"]]
   ```

4. Init empty `metadata.button_taps` accumulator; every button tap appends its exact label.
5. Wait for the user's typed sentence.

### State B: Button Handling (before typing)

`wb_sos`:

- Append `🆘 我卡壳了` to `metadata.button_taps`.
- Reply via `tg_msg type="render"` (text + same `buttons` as State A, no `url`) with a **sentence starter only** (e.g. "你可以这样开头：`Despite the fact that energy prices...`"). Do NOT write the full target sentence. The same buttons stay available so the user can still tap `wb_easier` if the starter wasn't enough.
- Wait again. SOS does NOT change the score envelope; it only assists.

`wb_easier`:

1. **Persist abandoned record FIRST** (before generating the replacement). Same envelope as State D, with these differences:

   ```
   completed=0, accuracy=0, response="",
   feedback="Learner tapped '💡 换个简单的' before answering. Treat as negative evidence at this constraint type.",
   minutes=0,
   metadata={"button_taps":["💡 换个简单的"],"abandoned_reason":"too_hard","constraint_type":"<connector|relative|inversion|...>","i_plus_one_dimension":"<dim>"}
   ```

   After `persist` returns, reset `metadata.button_taps`.

2. **Replacement.** Apply demotion / constraint-down (§2.3). Show the previous task's target sentence as a model via `tg_msg type="render"` (text only — not as evidence the user "should have known", but as a teaching example). Generate a new simpler micro-task → State A.

### State C: Evaluate

When the learner submits a typed sentence:

1. Check the **constraint**: did they actually use the required connector / clause / structure? If they paraphrased to avoid it, that is rubric `0.25`.
2. Grade the **grammar** holistically: subject-verb agreement, tense, articles, plural, preposition, word order. Each major issue drops one rubric step.
3. Grade against §2.0 rubric to produce continuous `accuracy` (0..1).
4. **Persist FIRST, THEN feedback**. Sequential.

Write the feedback as a natural short Chinese message — no fixed header, no ✅/❌ template. Every reply MUST cover, in some natural form:

- the user's sentence, quoted;
- a 1-line "Native Polish" — your improved version (mandatory even at 1.00, see Hard Rule 2);
- the **specific** grammar issue(s) named (e.g. "`fluctuate` 是动词，主语缺了 the prices"), or the **specific** lexical/cohesion improvement that drove the polish;
- one-phrase root cause when there were errors (verb form / article / fragment / connector misuse).

Two to four sentences usually enough.

Buttons (always, regardless of accuracy):

```json
[["✏️ 再写一句|wb_next", "🧭 练习其他|nav:main"]]
```

**Critical**: feedback + buttons in **one** `tg_msg type="render"` call (no `url` — feedback has no media). On **perfect** (`accuracy === 1.0`) add `react: "🔥"` to the same call.

### State D: Persist Evidence

Call `persist` with `action="practice"` (or omit `action`).

Minimum payload:

```json
{
  "skill_type": "writing.builder",
  "session_id": "<session>",
  "prompt": "<the micro-task as shown to the user, including target words>",
  "prompt_hash": "<sha1(normalized prompt) first 12 hex chars>",
  "response": "<the user's typed sentence>",
  "accuracy": 0.70,
  "raw_score": 0.70,
  "max_score": 1,
  "feedback": "<IN ENGLISH for DB / learner-state — the user-facing UI uses the Chinese feedback in §3 State C> Constraint met (used 'Despite + noun phrase'), but the verb 'fluctuate' was treated as a noun. Native polish swapped to 'Despite the fluctuating prices, the economy is recovering.'",
  "section": "writing",
  "minutes": 1,
  "mode": "study",
  "metadata": "{\"target_constraint\":\"despite_clause\",\"target_word\":\"fluctuate\",\"i_plus_one_dimension\":\"connector\",\"tier\":\"intermediate\",\"promotion_credit_after\":1,\"demotion_credit_after\":0}",
  "errors": "[{\"key\":\"word_form_error\",\"category\":\"writing\",\"severity\":\"medium\",\"original\":\"prices fluctuate\",\"correction\":\"the fluctuating prices\",\"note\":\"Used the verb form where a participle adjective was needed inside a 'Despite' phrase.\"}]",
  "subcap_scores": "[{\"key\":\"writing.grammar_accuracy\",\"score\":7.0,\"evidence\":\"Constraint met; one verb-form slip.\"},{\"key\":\"writing.cohesion\",\"score\":7.5,\"evidence\":\"Connector chosen correctly; clause boundary clear.\"}]"
}
```

`prompt_hash` = first 12 hex chars of `SHA-1(normalized prompt)`; normalize = lowercase + strip punctuation + collapse whitespace. Read dedup window via `recent_practice.recent_prompt_hashes` (§1).

`metadata.button_taps` mandatory if any button was tapped, even on `accuracy=1.0`.

State D persists attempted sentences only. Abandoned rows are written in State B. Use `response`, never `raw_content`.

### State E: Continue (`wb_next`)

- Re-call `persist action="recent_practice"` (§1) for credits + dedup. Don't reconstruct from chat memory.
- Apply §2.3 before generating.
- **NEVER re-call `coach_context` within the same skill session.** It is cached server-side (5-min TTL) and expensive. Only `recent_practice` needs re-reading for credits / dedup.
- Generate next micro-task (State A step 2 — incl. dedup). Respect "no same connector twice in a row" (§2.4).

## 4. Collaborates With

- `planner`: routes here when `writing.grammar_accuracy` / `writing.cohesion` is the highest-value drill.
- `learner-state`: reads persisted evidence; updates `MEMORY.md`.
- `planner`: (proactive nudge) uses errors / subcap scores to explain next steps and surface lingering verb-form / fragment issues.
- `vocab-harvest`: when the Native Polish introduces a teachable chunk (collocation / phrasal verb), auto-call to save it.
- `writing-rewrite`: graduates here once a learner can produce single sentences cleanly and is ready for paragraph upgrade.
- `support/data-contract`: defines the `persist` write protocol.

## 5. Failure And Fallbacks

- User replies in Chinese → don't score; gently re-state the constraint and wait. If they explicitly say "skip", write `completed=0`.
- `persist` fails → still send feedback, but say it was not saved.
- User writes the **whole pair of source clauses unchanged** (no constraint applied) → grade as `0.25`, point out the constraint was dodged, do NOT silently let it pass.
- User writes fluent English that violates the constraint (e.g. uses `Although` when asked for `Despite`) → grade `0.50`, name the swap, polish to the requested form.
- `<tg-spoiler>` is client-side; no callback. Don't invent `spoiler_used`.

## 6. Hard Rules

1. **One micro-task per round.** No batches. Each row = one prompt + one response.
2. **Always provide Native Polish.** Even at `accuracy=1.0`, show one slightly-better version. Never just say "Correct".
3. **Constraint is non-negotiable.** If the prompt asked for `Despite + noun phrase`, an answer using `Although + clause` is rubric `0.50`, not `1.00`.
4. **Diff every word** in the polish — explain what changed (lexical / grammatical / cohesive) so the learner knows the lesson.
5. Use `persist` for reads/writes; no raw DB.
6. Don't update `MEMORY.md`; `learner-state` owns durable ability state.
7. **All Telegram sends go through `tg_msg type="render"`.** Micro-task + buttons, SOS starter + buttons, demotion model + buttons, feedback + buttons + perfect-score `react: "🔥"` all fold into render calls. Never split into separate `text` / `keyboard` / `react` calls.
8. **No full sample writing.** SOS gives a sentence-starter, not the full answer. The user must complete the sentence themselves — that's the drill.
