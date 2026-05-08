---
name: coach
description: "Unified English coach: progress review, next-step recommendation, and trigger-based nudges."
---

# Coach

One coaching entry for both user-initiated review and system-triggered nudges.

## 1. When to Use
- User phrases: "帮我复盘", "教练", "最近怎么样", "下一步怎么练", "how am I doing"
- Callback/System triggers: `coach`
- A training skill detects a strong signal and escalates

## 2. Workflow A — User-Initiated Review

### State A: State Retrieval
1. **Read Memory**: Call the `memory` tool (`action=read`) to grasp their current estimated scores, weak dimensions, and top errors (which were just computed by `learner-state`).
2. **Read coaching context**: Call `persist` with `{"action":"coach_context","days":7,"limit":8}` to get profile facts, recent activity, recurring errors, weak subcaps, due vocabulary, personal-error cards, and planned tasks.

### State B: Diagnostic Review & Delivery
Once data is retrieved, formulate your coaching plan.
1. **Execute UI Action**: Use `tg_msg(type=keyboard)` to send the coaching report.
   - **Text**: Format the feedback strictly using Markdown. Do not be overly chatty; be a sharp, professional coach.
     - 👨‍🏫 **教练复盘** (A 2-sentence summary of their current state. E.g., "你最近的听力意群抓取进步明显，但口语流利度有下降趋势。")
     - 🎯 **突破口诊断** (Pick EXACTLY ONE top error from `MEMORY.md` and explain *why* it's happening and *how* it's holding them back).
     - 📚 **记忆压力点** (If `coach_context.due_words` or personal-error cards are non-empty, mention ONE due word/card that connects to the diagnosis.)
     - 🚀 **下一步行动建议** (Recommend EXACTLY ONE specific skill from the system to practice right now to fix the diagnosed error).
   - **Buttons (MANDATORY EXACT LAYOUT)**: 
     - Row 1: `[["🚀 听教练的，现在就练 (Start Recommended Skill)|<insert_recommended_skill_name_here>"]]`
     - Row 2: `[["🧭 回到主菜单|nav:main"]]`
2. **CRITICAL STOP**: End your turn.

## 3. Workflow B — Trigger-Based Nudge

Most trigger runs should produce no message. Silence is valid.

1. Read `MEMORY.md` and `persist action="coach_context"` for the last 7 days.
2. Evaluate triggers in `references/triggers.md` in priority order.
3. If none fire, output `[SILENT]` and stop.
4. If one fires, send a short message (≤ 4 sentences) with exactly one action button.
5. Record the push with `persist action="practice"`, `skill_type="coach.proactive"`, `section="coaching"`, `completed=1`, `load_score=0`.

## 4. Hard Rules
1. **One Focus**: Do not give a laundry list of things to do. A good coach gives exactly one high-ROI task.
2. **No Data Dumps**: Do not output raw SQL tables. Weave the data into the "突破口诊断".
3. **No MEMORY writes.** `learner-state` owns durable ability-state updates.
4. **No repeated nudges.** Record every sent push so later coach runs can avoid repeating it.
