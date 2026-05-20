---
name: writing-rewrite
description: "Upgrade a sample (current − 1) band paragraph to the next band level. Less intimidating than writing from scratch; teaches exact deltas between band levels."
---

# Writing Rewrite

Paragraph upgrade drill. One sample at a time: deliver a model paragraph one band below the learner's current level, set 4 explicit rewrite goals (词汇 / 结构 / 连接 / 保持原意), grade the rewrite vs a Band-7 model on 4 IELTS criteria, harvest one teaching-point chunk, persist, then optionally micro-drill the chunk in a fresh sentence. Adapt the next sample by i+1.

## 1. Inputs

Trigger when:

- User says: `改写`, `rewrite`, `样文升级`, `从 5.5 改到 6`.
- Callback `writing-rewrite`.
- Planner routes here when `writing.lexical_sophistication` or `writing.cohesion_logic` is the weakest writing subcap.

Required context before generating:

1. `persist {"action":"recent_practice","session_id":"<session>","skill_type":"writing.rewrite","limit":20}` (`limit` int). Returns rows + `recent_prompt_hashes`. Source of truth for §2.3 credit and §2.4 dedup; do not duplicate hashes in `metadata`.
2. `persist {"action":"coach_context","days":14,"limit":8}` for subcaps / errors / due tasks. Slow signal — only re-call when tier changes.
3. `MEMORY.md` / `USER.md` only as fallback. No raw `study.db` access.

## 2. Difficulty Policy

Target **i+1**: source paragraph is exactly **one band below** the learner's current level; rewrite goal is exactly **one band above** source. Adapt source paragraph length / topic / band level; never combine multiple stretches in one round.

### 2.0 Constants & Tier

| Constant | Value | Meaning |
| --- | --- | --- |
| `PASS_THRESHOLD` | `target_band(tier)` | A round with `band_overall ≥ PASS` is a pass. Target band varies by tier. |
| `FAIL_THRESHOLD` | `source_band(tier)` | Below source = fail (rewrite didn't even hold the original level). `[FAIL, PASS)` = "hold". |
| `STREAK` | `2` | Passes/fails to move tier. |
| `ACC_WINDOW` | `3` | Sample window for §2.2 mean. |
| `DEDUP_WINDOW` | `20` | Rolling `prompt_hash` window. |

This skill is **band-scored**, not accuracy-scored. `accuracy=NULL`. The gating signal is `band_overall` (continuous half-band 4.0–9.0). Threshold values are set per tier from the table below.

| Tier (learner's current band) | Source band (model passage) | Target band (rewrite goal) | Source paragraph length | Notes |
| --- | --- | --- | --- | --- |
| < 5.0 | 4.0 | 5.0 | 60–80 words | Practical narrative; basic SVO upgrade |
| 5.0–5.5 | 4.5 | 5.5 | 70–90 words | Add basic connectors (`however`, `therefore`); vary sentence opening |
| 5.5–6.0 | 5.0 | 6.0 | 80–100 words | Embed 1 relative clause; one collocation lift per sentence |
| 6.0–6.5 | 5.5 | 6.5 | 90–120 words | Lexical band shift (B1 → B2 phrases); discourse markers across sentences |
| 6.5–7.0 | 6.0 | 7.0 | 100–130 words | Nominalization, hedging, register precision |
| ≥ 7.0 | 6.5 | 7.5 | 110–140 words | Tight cohesion, idiomatic register, occasional inversion |

**Reading the learner's level from `MEMORY.md`** (do NOT confuse capability score 0–100 with IELTS band 0–9):

1. Prefer `Band Snapshot.Writing` (band number like `5.5`, `6.0`, or CEFR mapped to band: `A2`→5.0, `B1`→5.5, `B2`→6.5, `C1`→7.0).
2. Boundary suffix (`A2+`, `B1-`): **降一级起步**. Pick the **lower** band of the boundary as the tier anchor.
3. If band missing, fall back to 14-day `writing.lexical_sophistication` + `writing.cohesion_logic` average from `coach_context.summary.subcaps` (0–10 → divide by 10 then map: < 0.50 → 5.0; 0.50–0.65 → 5.5; 0.65–0.80 → 6.0; ≥ 0.80 → 6.5).
4. **Never** read `Core Capabilities.Writing: <n>/100` as the band — that's a 0–100 capability score.

### 2.2 Recent-accuracy

Mean `band_overall` over last `ACC_WINDOW` `completed=1` rows of current `session_id` + `skill_type`. Abandoned (`completed=0`) excluded from mean but count as fail for `demotion_credit`.

Fallback chain when fewer than `ACC_WINDOW` rows: 14-day mean from `coach_context.summary` → `MEMORY.md` band − 0.5 at shortest source → minimum tier (4.0/5.0). Never guess upward.

### 2.3 Credit gating

```
promotion_credit = walk recent_practice.rows newest→oldest (skip rows with parent_sample_id IS NOT NULL):
  count consecutive band_overall ≥ target_band(tier_at_that_time);
  reset on any fail (band_overall < source_band(tier_at_that_time) or completed=0);
  holds (between source and target) pass through.
demotion_credit = mirror.
abandoned (completed=0) = 1 fail.
```

| Credit | Action |
| --- | --- |
| `promotion_credit ≥ STREAK` at any tier | Promote tier (move to next row of §2.0 table); reset both credits. |
| `demotion_credit ≥ STREAK` at any tier (above floor) | Demote tier; reset both credits. |
| `demotion_credit ≥ STREAK` at floor tier (`< 5.0`) | Hold at floor; route to `writing-builder` if persists ≥ 4 rounds. |
| `rw_easier` tap | Persists abandoned row (State B); surfaces as fail next call. |

Redo rows (`parent_sample_id IS NOT NULL`) skipped from credit; still count for dedup. State F micro-drill rows also have `parent_sample_id IS NOT NULL` and are skipped.

Hold: keep tier source/target; swap topic family.

### 2.4 Generation

- Pick a topic relevant to the user's writing goals (recent `writing-essay` prompts, exam practice, work topics from `USER.md`).
- Stretch **at most one** dimension per round: source-paragraph length, lexical band, cohesion density.
- Reject any source whose `prompt_hash` ∈ `recent_practice.recent_prompt_hashes`.
- Pre-annotate **1–2 weak spots** in the source with `~...~` markdown (so the user knows where to focus the lift). Don't over-annotate; the rewrite still has to hunt.

## 3. Flow

### State A: Prepare And Deliver

1. From §2.3 + `coach_context`, decide tier → source band, target band, source length.
2. Generate the source paragraph at the chosen band. Compute `prompt_hash`; regenerate on dedup hit. Mark 1–2 weak spots with `~...~`.
3. Send a **single** `tg_msg type="render"` (text + buttons, no `url`) containing task + buttons:

   Text:

   ```text
   📝 润色升级任务

   下面是一段 Band {source} 的段落，你的目标是把它升级到 Band {target}。
   💡 润色 = 不改原意，升级表达：换更好的词、改更紧凑的句型、加逻辑连接词。

   <blockquote>{source paragraph with ~weak spots~ marked}</blockquote>

   **4 个目标**：
   1. 词汇升级（{source} → {target} 等级的搭配）
   2. 结构紧凑（变换句首 / 嵌入从句 / 名词化）
   3. 连接控制（discourse markers 串起逻辑）
   4. 保持原意（不要换主题，不要丢信息）

   写好后直接发给我你的改写版本。
   ```

   Buttons:

   ```json
   [["🆘 给我起头|rw_starter", "📚 解析样段|rw_explain", "💡 换个简单的|rw_easier"]]
   ```

4. Init empty `metadata.button_taps` accumulator.
5. Wait for user's rewrite.

### State B: Button Handling (before submitting)

`rw_starter`:

- Append `🆘 给我起头` to `metadata.button_taps`.
- Provide the **first sentence** of a rewrite (model your own opener), but stop after one sentence. The user must continue.
- Re-send the same keyboard.

`rw_explain`:

- Append `📚 解析样段` to `metadata.button_taps`.
- For the source paragraph, give a 3-line breakdown: claim / support / connector — pointing at WHERE the lift opportunities are (without writing the lift itself).
- Re-send the same keyboard.

`rw_easier`:

1. **Persist abandoned record FIRST**:

   ```
   completed=0, accuracy=NULL, band_overall=NULL, response="",
   feedback="Learner tapped '💡 换个简单的' before rewriting. Treat as negative evidence at this band.",
   minutes=0,
   metadata={"button_taps":["<accumulated, including 💡 换个简单的>"],"abandoned_reason":"too_hard","tier":"<tier>","source_band":<source>,"target_band":<target>}
   ```

   After `persist` returns, reset `metadata.button_taps`.

2. **Replacement.** Apply demotion (§2.3). Brief Chinese ack, generate a shorter / lower-band source → State A.

### State C: Evaluate

When the learner submits their rewrite:

1. Compute the **model Band-target rewrite** internally (don't send it yet). Use it as the comparison anchor.
2. Score against 4 IELTS criteria on the 0–10 canonical scale (mapped from 4.0–7.5 half-band: band 5.5 ≈ 5.5/10). Write each as a **subcap row**, not as `samples.band_*` columns (those columns were removed in schema v3):
   - `writing.task_achievement` — did they preserve the meaning + scope?
   - `writing.cohesion` — discourse flow, paragraph cohesion.
   - `writing.lexical_range` — vocab range + precision.
   - `writing.grammar_accuracy` — grammatical range + accuracy.
   - `samples.band_overall` = round(mean of 4, nearest 0.5), but cap at the lowest of the 4 + 0.5.
3. Diff by **3 axes**:
   - **Lexical** — what words/collocations got upgraded vs not.
   - **Structural** — sentence-pattern variety, embedding.
   - **Cohesion** — discourse markers, reference, parallelism.
4. Pick **one teaching-point chunk** from the model rewrite (the highest-leverage upgrade phrase). Auto-call `persist action="word_upsert"` with `mastery="queued_new"`, `is_user_word=0`, `origin="writing.rewrite"`, `example_en=<the model sentence containing this chunk>`.
5. **Persist FIRST, THEN feedback**. Sequential.

Feedback message must include:

- 4 band scores in 1 line: `Task X.X · Coh X.X · Lex X.X · Gram X.X → Overall X.X`.
- The user's rewrite **and** the model rewrite, side-by-side or stacked (whichever renders cleaner in Telegram).
- Diff by 3 axes (one short paragraph or 3 bullets).
- One **takeaway chunk** (原句 → 模型句 → 教法 in 1 line each), and "已经把 `<chunk>` 加进生词本".

Buttons (always, regardless of band):

```json
[["✏️ 再升级一段|rw_next", "🧭 练习其他|nav:main"]]
```

**Critical**: feedback + buttons in **one** `tg_msg type="render"` call (no `url`). The model rewrite and side-by-side diff can be inside the same body. On **perfect** (`accuracy === 1.0`) add `react: "🔥"` to the same call.

### State D: Persist Evidence

Call `persist` with `action="practice"` (or omit `action`). Call `word_upsert` for the takeaway chunk in **parallel**.

Minimum payload:

```json
{
  "skill_type": "writing.rewrite",
  "session_id": "<session>",
  "prompt": "<the source paragraph as shown to the user, including ~weak spot~ markers>",
  "prompt_hash": "<sha1(normalized prompt) first 12 hex chars>",
  "response": "<the user's full rewrite>",
  "accuracy": null,
  "band_overall": 6.0,
  "feedback": "<IN ENGLISH for DB / learner-state> Lexical lift inconsistent — promoted 'show' → 'demonstrate' but kept 'big' instead of 'substantial'. Structural variety improved (one fronted adverbial, one embedded relative). Cohesion: 'However' added correctly but missing reference back to the previous claim. Takeaway chunk: 'pose a substantial threat to' (sub for 'be very bad for').",
  "section": "writing",
  "minutes": 6,
  "mode": "study",
  "metadata": "{\"tier\":\"5.5-6.0\",\"source_band\":5.0,\"target_band\":6.0,\"source_words\":85,\"rewrite_words\":92,\"takeaway_chunk\":\"pose a substantial threat to\",\"axes_lift\":{\"lexical\":\"partial\",\"structural\":\"yes\",\"cohesion\":\"partial\"},\"promotion_credit_after\":1,\"demotion_credit_after\":0}",
  "subcap_scores": "[{\"key\":\"writing.lexical_sophistication\",\"score\":6.0,\"evidence\":\"Two upgrades adopted, two missed.\"},{\"key\":\"writing.cohesion_logic\",\"score\":6.5,\"evidence\":\"Connector chosen well; reference link weak.\"},{\"key\":\"writing.connector_density\",\"score\":6.0,\"evidence\":\"2 connectors in 92 words — within target range.\"}]"
}
```

`prompt_hash` = first 12 hex chars of `SHA-1(normalized prompt)`; normalize = lowercase + strip punctuation + collapse whitespace.

`metadata.button_taps` mandatory if any button was tapped.

State D persists fully-attempted rewrites only. Abandoned rows are written in State B. State F micro-drill rows are persisted with `parent_sample_id` pointing to the source row (redo chain is encoded entirely via parent_sample_id).

### State E: Continue (`rw_next`)

- Re-call `persist action="recent_practice"` (§1) for credits + dedup.
- Apply §2.3 before generating.
- **NEVER re-call `coach_context` within the same skill session.** It is cached server-side (5-min TTL) and expensive. Only `recent_practice` needs re-reading for credits / dedup.
- Generate next source paragraph (State A step 2 — incl. dedup).

## 4. Collaborates With

- `planner`: routes here when `writing.lexical_sophistication` / `writing.cohesion_logic` is the weakest writing subcap.
- `learner-state`: reads persisted band evidence; updates `MEMORY.md` band snapshot.
- `planner`: (proactive nudge) uses 4-axis subcap scores to explain which dimension is the bottleneck.
- `vocab-harvest` / `vocab-review`: auto-called for the takeaway chunk in State C.
- `writing-builder`: fallback when learner stuck below tier floor (sentence-level mechanics need work first).
- `writing-essay`: graduates here once the learner can hold target band on rewrites consistently — apply same techniques to original prompts.
- `support/data-contract`: defines the `persist` write protocol.

## 5. Failure And Fallbacks

- User rewrites less than 50% of source length → flag as "短改" in feedback; band might still be valid but record `metadata.coverage="partial"`.
- User changes the topic instead of upgrading → grade `writing.task_achievement` subcap at 4.0 (failed task achievement); name the issue as "保留原意" miss.
- User rewrites in 100% original phrasing (no upgrade attempted) → grade as if Band = source; do NOT auto-pass.
- User doesn't respond for >10 min → no auto-fail; user is composing. Wait.
- `persist` (practice or word_upsert) fails → still send feedback; mention what didn't save.
- `<tg-spoiler>` is client-side; no callback. Don't invent `spoiler_used`.

## 6. Hard Rules

1. **Source band = current − 1, min 4.0.** Never hand someone a paragraph at their own level — there'd be nothing to lift.
2. **Always show the model rewrite.** Without it the learner can't see the deltas. Never just say "good" with no model.
3. **Teach the 3 axes** — lexical / structural / cohesion. Naming the axis is the lesson; vague "better" doesn't transfer.
4. **One takeaway chunk per round** — auto-harvested. Quality > quantity. The State F micro-drill exists to consolidate this single chunk.
5. **One paragraph per session.** No multi-paragraph batches. Cohesion + lexical lift at the paragraph level is the unit.
6. Use `persist` for reads/writes; no raw DB.
7. Don't update `MEMORY.md`; `learner-state` owns durable ability state.
8. **All Telegram sends go through `tg_msg type="render"`.** Task delivery + buttons, scaffolds, feedback + model rewrite + buttons + perfect-score `react: "🔥"` all fold into render calls. Never split into separate `text` / `keyboard` / `react` calls.
