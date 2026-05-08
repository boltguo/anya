---
name: learner-state
description: "Data-driven capability assessment. Uses persist study_summary, computes moving averages, and presents a radar chart of the user's current English level."
---

# Learner State (Capability Radar)

Data-driven MEMORY refresh. Uses `persist action="study_summary"`, computes moving averages via EMA smoothing, and rewrites `MEMORY.md`. 

## 1. When to Use
- Manual user trigger: `我现在水平`, `我现在几分`, `sync`, `refresh`, `最近学得怎么样`
- Callback/System triggers: `learner-state`
- Note: This skill NEVER launches new tests. It only reads historical data.

## 2. Workflow (State Machine - STRICT EXECUTION)

### State A: Data Extraction
Execute the following actions:
1. Call `persist` with `{"action":"study_summary","days":14}`.
2. Use `memory` tool (`target="memory"`, `action="read"`) to get the current baseline.

### State B: Computation & Persistence
1. **EMA Computation**: For each skill from Q1, compute the new score (0-100 scale). 
   - `α = min(0.6, n / 10)`
   - `new_score = α × db_avg + (1 - α) × memory_score`
   - If `memory_score` is missing, use `db_avg` directly.
2. **Write to MEMORY.md**: Use the `memory` tool (`action=replace`) to update:
   - `Calibration`: confidence (low/med/high based on `n`), update date.
   - `Core Capabilities`: The newly computed scores for Listening, Speaking, Reading, Writing.
   - `Weak Dimensions`: weakest subcaps from `study_summary.subcaps`.
   - `Top Errors`: recurring errors from `study_summary.errors`.
3. Do not use the `db` tool. `band_trend` is maintained incrementally by `persist action="practice"`; MEMORY is the prompt-facing summary.

### State C: Delivery (UI)
- Use `tg_msg(type=keyboard)` to present the findings to the user.
  - **Text**: Present a highly structured, professional Markdown report.
    - 📊 **核心能力雷达** (Show scores out of 100)
    - ⚠️ **近期核心弱点** (Translate weakest subcaps into human-readable points)
    - 🐛 **最高频错误陷阱** (Translate recurring errors into actionable insights)
    - 🔥 **近期活跃度** (Show days active and total minutes)
  - **Buttons**: `[["💬 找教练复盘定制计划|coach"], ["🧭 回到主菜单|nav:main"]]`
- **CRITICAL STOP**: End your turn.

## 3. Hard Rules
1. **No Advice**: You are a data analyst, not a coach. Do not tell them *how* to fix the errors. Just report the data.
2. **Compute, Don't Guess**: Use the EMA formula. Do not make up numbers.
