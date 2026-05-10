---
name: reading-typetrain
description: "Drill one IELTS reading question type at a time (TFNG, Heading, Matching, Completion, Short Answer, MCQ). Per-type tier and credit. Trigger for '题型', 'TFNG', 'Heading', '专项'."
---

# Reading TypeTrain

Single-type specialist. One IELTS question type per session: passage + items, evidence-line debrief, persist, then adapt **within that type** by i+1. Each question type maintains its own tier and credit counters.

## 1. Inputs

Trigger when:

- User says: `题型`, `TFNG`, `Heading`, `Matching`, `Completion`, `MCQ`, `专项`.
- Callback `reading-typetrain` (auto-pick weakest type) or `reading-typetrain:<type>` (force a specific type).
- Planner routes here when `feedback.question_accuracy` shows a particular type underperforming for ≥ 14 days.

Required context before generating:

1. **Pick `question_type` first** (learner explicit, callback suffix, or auto from weakest). Then call `persist {"action":"recent_practice","session_id":"<session>","skill_type":"reading.typetrain","limit":20,"metadata_filter":{"question_type":"<type>"}}` (`limit` int). Returns rows + `recent_prompt_hashes` **filtered to this type**. Source of truth for §2.3 credit (per-type) and §2.4 dedup.
2. `persist {"action":"coach_context","days":14,"limit":8}` for subcaps / errors / weak types. Slow signal — only re-call when the type changes.
3. `MEMORY.md` / `USER.md` only as fallback. No raw `study.db` access.

If the persist tool's filter doesn't accept `metadata_filter`, fall back to a plain `recent_practice` and filter rows in code by parsing `metadata.question_type`.

## 2. Difficulty Policy

Target **i+1** **within the chosen type**. Adapt words / items / strategy density. Never combine multiple stretches in one round. Each type has its own `(easy / medium / hard)` ladder; credits do not transfer across types.

### 2.0 Constants & Tier

| Constant | Value | Meaning |
| --- | --- | --- |
| `PASS_THRESHOLD` | `0.70` | A round with `accuracy ≥ PASS` is a pass. |
| `FAIL_THRESHOLD` | `0.50` | Below = fail; `[FAIL, PASS)` = "hold". |
| `STREAK` | `2` | Passes/fails to bump difficulty within type. |
| `ACC_WINDOW` | `3` | Sample window for §2.2 mean (per-type). |
| `DEDUP_WINDOW` | `30` | Rolling `prompt_hash` window — wider than other reading skills because types are diverse. |

`accuracy` = correct items / total items. All items are binary (1 / 0).

| Type | Easy (words / items / time) | Medium | Hard |
| --- | --- | --- | --- |
| TFNG / YNNG | 350 / 6 / 11 min | 450 / 7 / 10 min | 550 / 8 / 10 min |
| Matching Headings | 400 / 5 / 11 min | 500 / 6 / 10 min | 600 / 7 / 10 min |
| Matching Features | 380 / 5 / 13 min | 460 / 6 / 12 min | 540 / 7 / 12 min |
| Sentence / Summary Completion | 380 / 6 / 13 min | 460 / 7 / 11 min | 540 / 8 / 10 min |
| Short Answer | 380 / 5 / 11 min | 460 / 6 / 10 min | 540 / 7 / 10 min |
| MCQ | 380 / 5 / 13 min | 460 / 6 / 12 min | 540 / 7 / 12 min |

**Reading the learner's level from `MEMORY.md`** (do NOT confuse capability score 0–100 with IELTS band 0–9):

1. Prefer `Band Snapshot.Reading` (CEFR string) to set the **starting difficulty** for an unseen type:
   - `A1`/`A2` → Easy
   - `B1` → Easy (boundary cautious)
   - `B2`/`C1`/`C2` → Medium (still let credits decide further)
2. If a row exists for this type in the last 14 days, ignore the band heuristic — trust §2.3 credit counters instead.
3. **Never** read `Core Capabilities.Reading: <n>/100` as IELTS band — that's a 0–100 capability score.

### 2.2 Recent-accuracy

Mean `accuracy` over last `ACC_WINDOW` `completed=1` rows for the **same `question_type`** in the current `session_id` + `skill_type`. Cross-type rows do NOT contribute. Abandoned (`completed=0`) excluded from mean but count as fail for `demotion_credit`.

Fallback chain when fewer than `ACC_WINDOW` rows for this type: 14-day type-specific mean from `coach_context.summary` if available → `MEMORY.md` band-derived starting difficulty (see §2.0). Never guess upward.

### 2.3 Credit gating

Per-type counters. When the user starts a different type, that type's counters resume from its own history.

```
promotion_credit = walk recent_practice.rows newest→oldest (same question_type, skip redo_count>0):
  count consecutive accuracy ≥ PASS; reset on any fail (< FAIL or completed=0); holds ([FAIL, PASS)) pass through.
demotion_credit = mirror.
abandoned (completed=0) = 1 fail.
```

| Credit | Action |
| --- | --- |
| `promotion_credit ≥ STREAK` at type's `hard` | Hold at hard but stretch one micro-dimension (paraphrase density, distractor closeness). |
| `promotion_credit ≥ STREAK` inside type (easy → medium, medium → hard) | Bump to next difficulty in this type; reset `promotion_credit`. |
| `demotion_credit ≥ STREAK` at type's `easy` | Suggest swapping to a different type (planner hint). |
| `demotion_credit ≥ STREAK` inside type | Drop to previous difficulty in this type; reset `demotion_credit`. |
| `tt_pause` tap | Brief pause, no abandoned record (user is taking a break). |
| `tt_strategy` tap | No effect on credits — purely informational. |

Retry rows (`redo_count > 0`) skipped from credit; still count for dedup.

Hold: keep difficulty, swap topic family.

### 2.4 Generation

- Pick a topic appropriate for IELTS reading (academic / general training mix, science / society / history / arts).
- Stretch **at most one** dimension per round: words, items, distractor closeness, paraphrase distance.
- Reject any passage whose `prompt_hash` ∈ `recent_practice.recent_prompt_hashes`.
- Ensure each item has a single defensible answer with a citable evidence line.
- For TFNG: balance across T / F / NG (no all-T runs); place at least one "tempting overread" trap (where the passage says `some` but the statement says `most`).
- For MCQ: distractors must each be plausibly wrong for a different reason (one is keyword-match, one is partial truth, one is opposite).

## 3. Flow

### State A: Prepare And Deliver

1. From the chosen `question_type` and §2.3 credits, decide difficulty (easy / medium / hard) and pick (words, items, time) from the §2.0 table.
2. Generate the passage + items. Compute `prompt_hash`; regenerate on dedup hit.
3. Send a `tg_msg type="text"` with a **strategy nudge ≤ 5 lines** for this type (not a textbook; e.g. for TFNG: "找到原文具体句; 看是否同义改写 → T; 是否反义/数字不同 → F; 完全没提 → NG; `some` vs `most`, `may` vs `will` 是高频陷阱").
4. Send the passage in a `tg_msg type="text"` call (plain — no `<blockquote>` because typetrain expects re-reading during the timed session).
5. Send a separate `tg_msg type="keyboard"` (no media) with text + buttons:

   Text:

   ```text
   ⏱️ {type} · {difficulty} — {items} 题，限时 {time} 分钟。答完一次性 force_reply 提交。
   ```

   Buttons:

   ```json
   [["⏸️ 暂停|tt_pause", "🆘 看不懂题型策略|tt_strategy"]]
   ```

6. Send the items as a single `tg_msg type="force_reply"` block formatted clearly (one item per line, e.g. `Q1. ___ / Q2. ___`).
7. Init empty `ui_feedback` accumulator.

### State B: Button Handling (during the timed session)

`tt_pause`:

- Append `⏸️ 暂停` to `ui_feedback`.
- Brief Chinese ack ("好，慢慢来"). Don't generate anything; user resumes by submitting answers.
- Do NOT persist abandoned record.

`tt_strategy`:

- Append `🆘 看不懂题型策略` to `ui_feedback`.
- Send a slightly longer (≤ 8 lines) strategy explanation for this type, with a worked mini-example **on a different passage** (so it's a teaching aid, not the answer).
- Wait for the user's `force_reply` answer.

### State C: Evaluate

When the learner submits their batch of answers:

1. Parse the answer block (e.g. `Q1: TRUE, Q2: FALSE, Q3: NG, Q4: TRUE`). Be tolerant of formats (T / TRUE / true / 对 / yes — all map to TRUE).
2. Per item: mark correct / wrong; identify trap category (TFNG: overread `some`→`most`; Heading: paragraph-keyword decoy; Matching: surface-feature trap; Completion: paraphrase miss; MCQ: distractor archetype).
3. `accuracy = correct / total`.
4. **Persist FIRST, THEN feedback**. Sequential.

Feedback message must include, for **every** item (right or wrong):

- The correct answer.
- A 1-line **evidence**: which sentence / clause in the passage carries the answer (quote fragment).
- The **trap category** if wrong (e.g. "陷阱：keyword match — 原文 `some species` 不是 `most species`").

Followed by a strategy recap: total accuracy, top recurring trap (if ≥ 2), one next-time tip.

Buttons (always, regardless of accuracy):

```json
[["🎯 同题型再来|reading-typetrain:<type>", "🔀 换题型|reading-typetrain", "🧭 练习其他|nav:main"]]
```

**Critical**: feedback + buttons in **one** `tg_msg type="keyboard"` call. The per-item evidence list can be a separate `tg_msg type="text"` before; feedback+buttons must go together.

### State D: Persist Evidence

Call `persist` with `action="practice"` (or omit `action`).

Minimum payload:

```json
{
  "skill_type": "reading.typetrain",
  "session_id": "<session>",
  "prompt": "<the full passage text + the items, joined>",
  "prompt_hash": "<sha1(normalized prompt) first 16 chars>",
  "response": "<per-item answers, e.g. 'Q1:TRUE, Q2:FALSE, Q3:NG, Q4:TRUE, Q5:FALSE, Q6:NG'>",
  "accuracy": 0.83,
  "raw_score": 5,
  "max_score": 6,
  "feedback": "<IN ENGLISH for DB / learner-state> 5/6 on TFNG (medium). Missed Q3 — overread 'some species' as 'most species' (T → NG trap). Strategy point: scan quantifiers before locking T.",
  "section": "reading",
  "domain": "reading",
  "load_score": 2,
  "minutes": 10,
  "mode": "study",
  "ui_feedback": "<comma-joined exact button labels tapped this round, e.g. '⏸️ 暂停' — empty if none>",
  "metadata": "{\"question_type\":\"TFNG\",\"difficulty\":\"medium\",\"words\":450,\"items\":6,\"time_minutes\":10,\"top_trap\":\"overread_quantifier\",\"promotion_credit_after\":1,\"demotion_credit_after\":0}",
  "errors": "[{\"key\":\"tfng_logic_error\",\"category\":\"reading\",\"severity\":\"medium\",\"original\":\"answered TRUE\",\"correction\":\"NG\",\"note\":\"Passage said 'some species', statement said 'most species' — quantifier mismatch makes this NG, not T.\"}]",
  "subcap_scores": "[{\"key\":\"reading.paraphrase_mapping\",\"score\":7.5,\"evidence\":\"5 of 6 paraphrase mappings correct.\"},{\"key\":\"reading.argument_structure\",\"score\":7.0,\"evidence\":\"Detected the main claim but missed the quantifier scope.\"}]"
}
```

`metadata.question_type` is **mandatory** — the recent_practice query in §1 filters on it.

`prompt_hash` = first 16 hex chars of `SHA-1(normalized prompt)`; normalize = lowercase + strip punctuation + collapse whitespace.

Subcap mapping by type:

- TFNG / YNNG → `reading.paraphrase_mapping`, `reading.author_attitude`
- Matching Headings → `reading.gist`, `reading.argument_structure`
- Matching Features → `reading.detail_location_fail`-related (use `reading.argument_structure`)
- Completion → `reading.paraphrase_mapping`, `reading.detail_accuracy`
- Short Answer → `reading.detail_accuracy`
- MCQ → `reading.author_attitude`, `reading.paraphrase_mapping`

### State E: Continue (`reading-typetrain:<type>` or `reading-typetrain`)

- Re-call `persist action="recent_practice"` (§1) with the chosen type. Don't reconstruct from chat memory.
- Apply §2.3 (skip `redo_count > 0`) before generating.
- Skip `coach_context` re-call unless type changed.
- Generate next passage + items (State A step 2 — incl. dedup).

## 4. Collaborates With

- `planner`: routes here when a specific question type is the highest-value drill.
- `learner-state`: reads persisted evidence; updates per-type `feedback.question_accuracy` in `MEMORY.md`.
- `planner`: (proactive nudge) uses errors / subcap scores to explain trap families.
- `reading-skim-drill`: graduates back here once timed pace is solid and the user wants type-specific accuracy work.
- `support/data-contract`: defines the `persist` write protocol.

## 5. Failure And Fallbacks

- User submits partial answers (e.g. only Q1-Q3 of 6) → grade what was submitted; mark missing items wrong; record `metadata.partial_submit=true`.
- User answers in Chinese / wrong format → ask once for the canonical format (e.g. `Q1: TRUE`); if still unparseable, write `completed=0`.
- `tt_pause` then 30+ minutes idle → don't auto-fail; just wait. The session lives until next user action.
- `persist` fails → still send feedback + per-item evidence, but say it was not saved.

## 6. Hard Rules

1. **One type per session.** No mixed-type batches. Each row's `metadata.question_type` is single-valued.
2. **Every item gets an evidence line** — right answers too. The lesson is in the evidence, not the score.
3. **Strategy ≤ 5 lines** at delivery. The deeper version only on `tt_strategy` tap.
4. **Persist `metadata.question_type`** so §1's filter works on the next round; without it, credits leak across types.
5. **Distractors must have archetypes.** MCQ wrong answers cannot all be random — keyword-match / partial-truth / opposite. That's what makes the type drillable.
6. Use `persist` for reads/writes; no raw DB.
7. Don't update `MEMORY.md`; `learner-state` owns durable ability state.
8. **One-call keyboard.** Feedback + buttons go out in a single `tg_msg type="keyboard"` call. Never `type="text"` then `type="edit"` to attach buttons.
