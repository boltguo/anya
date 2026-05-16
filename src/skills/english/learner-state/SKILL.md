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
2. Call `persist` with `{"action":"progress_trend","limit":8}` when comparing against previous frozen weeks.
3. Use `memory` tool (`target="memory"`, `action="read"`) to get the current baseline.

### State B: Computation & Persistence
1. **EMA Computation**: For each skill from Q1, compute the new score (0-100 scale). 
   - `α = min(0.6, n / 10)`
   - `new_score = α × db_avg + (1 - α) × memory_score`
   - If `memory_score` is missing, use `db_avg` directly.
2. **Write to MEMORY.md**: Use the `memory` tool (`action=replace`) to update:
   - `Calibration`: confidence (low/med/high based on `n`), update date.
   - `Core Capabilities`: The newly computed scores for Listening, Speaking, Reading, Writing.
   - `Weak Spots`: merge weakest subcaps + recurring errors into a single section (replaces the old separate "Weak Dimensions", "Top Errors", and "Error Tendencies" sections).
   - `Coaching & Adaptive Controls`: merge coaching strategy + adaptive training parameters into one section.
   - `Study Consistency`: recent minutes, active days, reviewed words, and planned tasks from `coach_context.summary.activity` / `coach_context.due_tasks`.
   - **Compact-write rules**: omit fields with value "n/a", "not tested", 0, or "none". Per-skill profiles: max 4 lines each. Do not duplicate info across sections.
3. **Weekly Snapshot**: If this is a manual progress report, weekly cron run, or meaningful state refresh, compute the snapshot fields from `coach_context`, `progress_trend`, and MEMORY, then call `persist action="progress_snapshot"` with the computed values:
   - `current_level`, four skill scores, vocabulary counts, total minutes, active days, sample/session counts, due-word count, weakest subcaps JSON, top errors JSON, and notes.
   - This writes `progress_snapshots`. `persist` only upserts the provided values; it does not decide scores or learner state.
   - Do not let ordinary practice skills write this table.
4. Do not use the `db` tool. `band_trend` is maintained incrementally by `persist action="practice"`; `progress_snapshots` is maintained by `learner-state`; MEMORY is the prompt-facing summary.

### State C: Delivery (UI)

Use `tg_msg(type=keyboard)` to present a **compact, scannable** report. Do NOT dump raw data or repeat information across sections.

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
- **Buttons**: `[["🧭 回到主菜单|nav:main"]]` — no coach button.
- **CRITICAL STOP**: End your turn. Do NOT offer to explain errors or suggest next steps — that's planner's job.

## 3. Hard Rules
1. **No Advice**: You are a data analyst, not a coach. Do not tell them *how* to fix the errors. Just report the data with concrete examples.
2. **Compute, Don't Guess**: Use the EMA formula. Do not make up numbers.
3. **Own Learning State**: Durable ability summaries, weekly snapshots, and MEMORY level records belong here. Other practice skills only write evidence through `persist action="practice"`.
4. **Compact output**: The entire report should fit in ~10 lines. No paragraphs, no numbered sub-lists under each weakness. One line per item.
5. **No raw keys**: Never expose database column names or error keys to the user. Always translate to Chinese.
