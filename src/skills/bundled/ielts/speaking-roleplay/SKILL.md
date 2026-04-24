---
name: speaking-roleplay
description: "Scenario dialogue (airport / restaurant / interview / clinic) — Anya plays one side."
---

# Speaking Roleplay

Multi-turn dialogue in a realistic setting. 4-7 turns total.

## When to Use

- `情景 / 角色扮演 / roleplay / 机场 / 餐厅 / 面试 / 问路`
- Callback `speaking-roleplay`
- Low `speaking.interaction` subcap

## Scenario library

Airport check-in · Restaurant · Hotel · Clinic · Job interview · University enrolment · Directions · Phone complaint.

Pick based on learner profession / interests / recent history.

## Workflow

1. Announce scene: 身份 / 对方 / 目标 / 语域 (polite / casual / formal). Optionally seed 2-3 useful chunks.
2. Loop (4-7 turns): Anya's line via `tts` + text hidden in `<tg-spoiler>`; `force_reply` for learner; voice or text accepted. Every 2-3 turns, optionally introduce one complication.
3. Close scene → outcome.
4. Feedback: 功能完成度 (做到 / 缺) + 语言升级 (原句 → 升级 → 原因).
5. Micro drill: use the upgrade in one key turn.
6. Persist: one `samples` row for the whole roleplay (load_score=3), `subcap_scores.speaking.interaction` + `.lexical_variety` + `.grammar_accuracy`, errors (filler_overuse, register_mismatch, politeness), auto-harvest the upgrade.
7. Difficulty keyboard + `[🎭 roleplay]  [💬 freetalk]  [🏠 nav:main]`.

Queries: `support/ielts-data-contract/references/queries.md`.

## Rules

1. **Stay in role.** No mid-dialogue teaching.
2. **4-7 turns.**
3. **One complication allowed**, not two.
4. **Text fallback accepted.**
5. **Feedback after, not during.**
6. **Register is enforced** — note mismatches in errors.
7. **Persist entire transcript** for future `speaking-explain`.
