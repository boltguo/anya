---
name: practice
description: "Practice entry: paging inline keyboard for IELTS skill drills"
---

# Practice Entry — Paging Inline Keyboard

## When to Use

- Learner says "练习", "学习", "practice", "开始练习"
- `menu` / `practice` callback
- Returning from a completed exercise

**NOT this skill** if the learner specifies a type (e.g. "练口语") — routes directly.

## Menu Definition

Menu pages are defined in `templates/menu.json`. The adapter reads this file directly — no LLM round-trip.

### Button Format

Each button is `"Label|callback_data"`:

- `nav:xxx` — edit keyboard in-place (no agent call)
- Other callbacks — trigger the agent

### Adding Pages

1. Add a key in `templates/menu.json`
2. Add `nav:xxx` button on the parent page
3. Add `← 返回|nav:main` on the new page

## Rules

1. **Menu is pure data** — lives in `templates/menu.json`, not in this file.
2. **One message, edit in-place** — no new messages for page transitions.
3. **`nav:` = zero LLM cost** — handled entirely by the adapter.
