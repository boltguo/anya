---
name: learner-state
description: "Data-driven capability assessment. Queries study.db, computes moving averages, and presents a radar chart of the user's current English level."
---

# Learner State (Capability Radar)

Data-driven MEMORY refresh. Queries `study.db`, computes moving averages via EMA smoothing, and rewrites `MEMORY.md`. 

## 1. When to Use
- Manual user trigger: `我现在水平`, `我现在几分`, `sync`, `refresh`, `最近学得怎么样`
- Callback/System triggers: `learner-state`
- Note: This skill NEVER launches new tests. It only reads historical data.

## 2. Workflow (State Machine - STRICT EXECUTION)

### State 0: Clean Slate
- **MANDATORY**: Call the `reset_context` tool immediately when this skill starts. Pass NO arguments.

### State A: Data Extraction (Query `study.db`)
Execute the following 5 actions using the `db` tool (Target: `study`):
1. **Q1 (Average Score)**: `SELECT skill_type, ROUND(AVG(raw_score),2) AS avg_score, COUNT(*) AS n FROM samples WHERE created_at >= date('now','-14 days') GROUP BY skill_type;`
2. **Q2 (Weak Subcaps)**: `SELECT subcap_key, ROUND(AVG(score),1) AS avg_score, COUNT(*) AS n FROM subcap_scores WHERE created_at >= date('now','-14 days') GROUP BY subcap_key HAVING avg_score < 70 AND n >= 2 ORDER BY avg_score ASC;`
3. **Q3 (Top Errors)**: `SELECT recurrence_key, category, COUNT(*) AS c FROM errors WHERE sample_id IN (SELECT id FROM samples WHERE created_at >= date('now','-14 days')) GROUP BY recurrence_key ORDER BY c DESC LIMIT 5;`
4. **Q4 (Activity)**: `SELECT COUNT(DISTINCT date) AS active_days, COALESCE(SUM(sessions_count),0) AS total_sessions, COALESCE(SUM(minutes_total),0) AS total_minutes FROM activity_log WHERE date >= date('now','-7 days');`
5. **Q5 (Read Memory)**: Use `memory` tool (`action=read`) to get the current baseline.

### State B: Computation & Persistence
1. **EMA Computation**: For each skill from Q1, compute the new score (0-100 scale). 
   - `α = min(0.6, n / 10)`
   - `new_score = α × db_avg + (1 - α) × memory_score`
   - If `memory_score` is missing, use `db_avg` directly.
2. **Write to MEMORY.md**: Use the `memory` tool (`action=replace`) to update:
   - `Calibration`: confidence (low/med/high based on `n`), update date.
   - `Core Capabilities`: The newly computed scores for Listening, Speaking, Reading, Writing.
   - `Weak Dimensions`: Output from Q2.
   - `Top Errors`: Output from Q3.
3. **Write to DB**: Use `db` tool to execute:
   ```sql
   INSERT INTO band_trend (date, section, band_estimate, sample_count, source) VALUES (date('now'), 'overall', <computed_overall>, <total_n>, 'learner-state') ON CONFLICT(date, section) DO UPDATE SET band_estimate = excluded.band_estimate, sample_count = excluded.sample_count;
   ```

### State C: Delivery (UI)
- Use `tg(type=keyboard)` to present the findings to the user.
  - **Text**: Present a highly structured, professional Markdown report.
    - 📊 **核心能力雷达** (Show scores out of 100)
    - ⚠️ **近期核心弱点** (Translate Q2 subcaps into human-readable points)
    - 🐛 **最高频错误陷阱** (Translate Q3 into actionable insights)
    - 🔥 **近期活跃度** (Show days active and total minutes)
  - **Buttons**: `[["💬 找教练复盘定制计划|coach-consultation"], ["🧭 回到主菜单|nav_main"]]`
- **CRITICAL STOP**: End your turn.

## 3. Hard Rules
1. **No Advice**: You are a data analyst, not a coach. Do not tell them *how* to fix the errors. Just report the data.
2. **Compute, Don't Guess**: Use the EMA formula. Do not make up numbers.
