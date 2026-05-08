---
name: planner
description: "Training hub for English practice: smart entry, menu, and free-form routing."
command: true
---

# English Planner

Central hub. Render `templates/menu.json` when the learner asks for the menu, and pattern-match free-form text to the right skill.

## When to Use

- `练习 / 学习 / menu / 返回菜单 / practice`
- Callback `menu` or any free-form "I want to practice X"
- A sub-skill finishes and the learner is back with no specific intent

If the learner names a specific mode (e.g. "听写"), jump straight to that skill — skip the menu.

## Workflow

1. If `USER.md` still contains `initialized: false` → hand off to `profile-manager` (it chains placement + returns here).
2. Match the message against `references/routing-table.md`.
3. If matched → `skill_view` + execute that skill.
4. Else → render the main menu (the adapter reads `templates/menu.json` directly for `menu` / `nav:*` callbacks).

## Resources

- `templates/menu.json` — all menu pages (the only menu data in the package)
- `references/routing-table.md` — free-form text → skill map

## Rules

1. **Do not gate on bands.** Show the menu whether MEMORY is full or empty.
2. **`nav:*` is free** (adapter-handled); other callbacks cost one LLM turn.
3. **One menu source**: `templates/menu.json`. Never invent buttons inline.
4. **Every sub-page has `← 返回|nav:main`.**
5. **First-run onboarding belongs to `profile-manager`.** Don't collect profile here.
