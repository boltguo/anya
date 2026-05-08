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
   - `Weak Dimensions`: weakest subcaps from `coach_context.summary.subcaps`.
   - `Top Errors`: recurring errors from `coach_context.summary.errors`.
   - `Vocabulary Profile`: due-word count, weak recall signals, and personal-error cards from `coach_context.due_words` / `coach_context.personal_error_cards`.
   - `Study Consistency`: recent minutes, active days, reviewed words, and planned tasks from `coach_context.summary.activity` / `coach_context.due_tasks`.
3. **Weekly Snapshot**: If this is a manual progress report, weekly cron run, or meaningful state refresh, compute the snapshot fields from `coach_context`, `progress_trend`, and MEMORY, then call `persist action="progress_snapshot"` with the computed values:
   - `current_level`, four skill scores, vocabulary counts, total minutes, active days, sample/session counts, due-word count, weakest subcaps JSON, top errors JSON, and notes.
   - This writes `progress_snapshots`. `persist` only upserts the provided values; it does not decide scores or learner state.
   - Do not let ordinary practice skills write this table.
4. Do not use the `db` tool. `band_trend` is maintained incrementally by `persist action="practice"`; `progress_snapshots` is maintained by `learner-state`; MEMORY is the prompt-facing summary.

### State C: Delivery (UI)
- Use `tg_msg(type=keyboard)` to present the findings to the user.
  - **Text**: Present a highly structured, professional Markdown report.
    - 📊 **核心能力雷达** (Show scores out of 100)
    - ⚠️ **近期核心弱点** (Translate weakest subcaps into human-readable points)
    - 🐛 **最高频错误陷阱** (Translate recurring errors into actionable insights)
    - 📚 **词汇复习压力** (Show due-word count and 1-2 representative weak words/cards)
    - 🔥 **近期活跃度** (Show days active and total minutes)
  - **Buttons**: `[["💬 找教练复盘定制计划|coach"], ["🧭 回到主菜单|nav:main"]]`
- **CRITICAL STOP**: End your turn.

## 3. Hard Rules
1. **No Advice**: You are a data analyst, not a coach. Do not tell them *how* to fix the errors. Just report the data.
2. **Compute, Don't Guess**: Use the EMA formula. Do not make up numbers.
3. **Own Learning State**: Durable ability summaries, weekly snapshots, and MEMORY level records belong here. Other practice skills only write evidence through `persist action="practice"`.
