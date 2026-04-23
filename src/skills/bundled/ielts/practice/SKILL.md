---
name: practice
description: "Practice entry: direct training hub for IELTS-inspired English drills"
---

# Practice Entry — Direct Training Hub

## When to Use

- Learner says "练习", "学习", "practice", "开始练习"
- `menu` / `practice` callback
- Returning from a completed exercise

**NOT this skill** if the learner specifies a type (e.g. "练口语") — routes directly.

## Entry Logic

When practice is triggered:

1. Read `MEMORY.md`
2. If `IELTS Bands.Overall` is missing, assume a temporary mid-level start (`5.0`) and proceed
3. Show the static training menu immediately

The learner should be able to start without passing through assessment, scheduling, or mock flows.

## Static Menu (Fallback / Full Menu)

Menu pages are defined in `templates/menu.json`. The adapter reads this file directly — no LLM round-trip.

### Button Format

Each button is `"Label|callback_data"`:

- `nav:xxx` — edit keyboard in-place (no agent call)
- Other callbacks — trigger the agent

### Adding Pages

1. Add a key in `templates/menu.json`
2. Add `nav:xxx` button on the parent page
3. Add `← 返回|nav:main` on the new page

## Menu Pages

- `main` — 训练主菜单（入口）
- `writing` → 写作模式选择
- `speaking` → 口语模式选择
- `listening` → 听力模式选择
- `reading` → 阅读模式选择
- `menu_ext` → 延展轨菜单（泛读 / 泛听 / 影子跟读）

## Rules

1. **Direct practice is the default view.** No mandatory assessment, no mandatory schedule.
2. **Menu is pure data** — lives in `templates/menu.json`, not in this file.
3. **One message, edit in-place** — no new messages for page transitions.
4. **`nav:` = zero LLM cost** — handled entirely by the adapter.
5. **Use MEMORY scores only as difficulty control.** Do not present them as a test result unless the learner asks.
