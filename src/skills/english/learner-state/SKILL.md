---
name: learner-state
description: "Data-driven capability assessment. Uses persist coach_context, computes moving averages, writes weekly progress snapshots, and presents a radar chart of the user's current English level."
---

# Learner State (Capability Radar)

Data-driven MEMORY refresh and long-arc learning-state owner. Uses `persist action="coach_context"`, computes moving averages via EMA smoothing, rewrites `MEMORY.md`, and freezes progress snapshots through `persist action="progress_snapshot"`.

## 1. When to Use
- Manual user trigger: `我现在水平`, `我现在几分`, `sync`, `refresh`, `最近学得怎么样`
- Callback/System triggers: `learner-state`
- Future cron trigger: weekly/daily scheduled state refresh. Cron should call this skill or its `persist` actions, not raw SQL.
- Note: This skill NEVER launches new tests. It only reads historical data.

## 2. Workflow (State Machine - STRICT EXECUTION)

### State A: Data Extraction
Execute the following actions:
1. Call `persist` with `{"action":"coach_context","days":14,"limit":8}`.
2. Call `persist` with `{"action":"learner_state_scores","days":14}` — **this is the canonical EMA**. Returns `scores.{listening,speaking,reading,writing}` already EMA-blended against the previous frozen snapshot, plus `confidence` (high/medium/low) and `sample_counts`. **Do NOT recompute EMA in the LLM** — that path is removed; the server math is authoritative.
3. Call `persist` with `{"action":"progress_trend","limit":8}` when comparing against previous frozen weeks.
4. Use `memory` tool (`target="memory"`, `action="read"`) to get the current baseline.

### State B: Computation & Persistence
1. **Use the scores from `learner_state_scores`**. The four 0–100 scores, the confidence label, and the previous-snapshot baseline are already on the response. The only LLM job here is to **write narrative** around them, not to do arithmetic.
2. **Write to MEMORY.md** with `memory` tool (`action=replace`). The file has exactly four sections — `Calibration`, `Capabilities`, `Coaching Strategy`, `Metacognition`. Write only these:
   - `Calibration`: confidence (low/med/high based on `n`), last_updated.
   - `Capabilities`: `overall` cefr; per-skill `score (0–100) · cefr` for listening/speaking/reading/writing; for vocabulary write receptive/productive levels only; for grammar write mastered/weak/unstable_under_pressure tags (short comma list).
   - `Coaching Strategy`: recommended_difficulty (CEFR range), what_works, what_to_avoid, redo_priority (the few subcaps to drill next), best_topic_hooks.
   - `Metacognition`: self_prediction_gap, self_attribution_accuracy.
   - **Do NOT duplicate `learner_profile` fields** (target_exam, target_level, exam_date, current_level, etc.) — they live in `study.db` and are read via `coach_context` when needed.
   - **Do NOT add sections** like `Level`, `Weak Spots`, `Study Consistency`, `Strong Dimensions`, per-skill `Listening/Speaking/Reading/Writing Profile`. Activity counts, weakest-subcap examples, and target dates are live data — pull from `coach_context` at delivery time.
   - **Compact-write rules**: omit any field whose value would be "n/a", "not tested", 0, or "none". One line per bullet; no paragraphs.
3. **Weekly Snapshot**: If this is a manual progress report, weekly cron run, or meaningful state refresh, call `persist action="progress_snapshot"`. The v3 snapshot row carries **5 fields only**: `week` (auto from current ISO week if omitted), `current_level`, `listening_score`, `speaking_score`, `reading_score`, `writing_score`, `notes`. Two paths:
   - **Recommended**: pass only `current_level` (+ optional `notes`). Persist falls back to the same `learner_state_scores` EMA for the four section scores.
   - **Override**: pass explicit `{listening,speaking,reading,writing}_score` only if you have an out-of-band reason (e.g. placement just finished).
   - Vocab counts / activity / weak_subcaps / top_errors are **derived at read time** from `samples` + `subcap_scores` and live in `coach_context.summary` — they are NOT snapshot fields and must NOT be passed in. Do not let ordinary practice skills write this table.
4. Do not use the `db` tool. `progress_snapshots` is owned by this skill; `samples` / `subcap_scores` / `errors` are written by practice skills and read on demand via `coach_context`. MEMORY is the prompt-facing summary.

### State C: Delivery (UI)

Use `tg_msg(type="render")` (text + buttons, no `url`) to present a **compact, scannable** report. Do NOT dump raw data or repeat information across sections.

**Template** (adapt numbers; do not add extra sections):

```
📊 能力快照 · {current_level}

🎧 听力 {L}   🗣️ 口语 {S}   📖 阅读 {R}   ✍️ 写作 {W}

⚠️ 最需要突破的点
1. {weakness_1 — 1 line, Chinese, with a concrete example from errors}
2. {weakness_2 — 1 line}
3. {weakness_3 — 1 line, optional}

📚 词汇 · {due_count} 个到期 · 代表: {1-2 weak words}

🔥 最近 {active_days} 天 · {total_minutes} 分钟 · {samples_count} 次练习
```

`active_days`, `total_minutes`, `samples_count` are derived from `coach_context.summary.activity` (one row per date with `samples_count` + `minutes_total`). Sum them in the LLM at delivery time — they are NOT snapshot fields. If `activity` is empty, omit the 🔥 line entirely (don't render `0 天 · 0 分钟`).

**Rules for the report**:
- Scores use the **0-100 scale** on one line, no bullet list.
- **Merge** weak subcaps + recurring errors into ONE "最需要突破的点" block (max 3 items). Do NOT have separate "弱点" and "错误" sections — they overlap.
- **Translate error keys** to plain Chinese. Never show raw keys like `pronunciation_vowel` or `verb_pattern`. Map them:
  - `pronunciation_vowel` → 元音发音不稳
  - `pronunciation_consonant` → 辅音/词尾收音不清
  - `verb_pattern` / `verb_form_error` → 动词搭配/时态错误
  - `l1_transfer` → 中式英语/母语迁移
  - `function_word_miss` → 功能词（介词/冠词）漏听/漏写
  - `collocation_error` → 搭配不自然
  - Other keys → translate to short Chinese description
- Each weakness line MUST include **one concrete example** from `coach_context.summary.errors` (e.g., "must to fix → must fix").
- `buttons`: `[["🧭 回到主菜单|nav:main"]]` — no coach button.
- **CRITICAL STOP**: End your turn. Do NOT offer to explain errors or suggest next steps — that's planner's job.

## 3. Hard Rules
1. **No Advice**: You are a data analyst, not a coach. Do not tell them *how* to fix the errors. Just report the data with concrete examples.
2. **Numbers come from `learner_state_scores`**, not LLM arithmetic. The server has the EMA formula and the previous-snapshot baseline; trust it. If you find yourself multiplying or rounding scores by hand, you've gone off-script.
3. **Own Learning State**: Durable ability summaries, weekly snapshots, and MEMORY level records belong here. Other practice skills only write evidence through `persist action="practice"`.
4. **Compact output**: The entire report should fit in ~10 lines. No paragraphs, no numbered sub-lists under each weakness. One line per item.
5. **No raw keys**: Never expose database column names or error keys to the user. Always translate to Chinese.
6. **All Telegram sends go through `tg_msg type="render"`.** The radar report uses render with `text`+`buttons`. Never use stand-alone `text` / `keyboard` calls.
