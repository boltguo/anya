---
name: practice
description: "Practice entry: dynamic today's tasks + paging inline keyboard for IELTS skill drills"
---

# Practice Entry — Dynamic Training Hub

## When to Use

- Learner says "练习", "学习", "practice", "开始练习"
- `menu` / `practice` callback
- Returning from a completed exercise

**NOT this skill** if the learner specifies a type (e.g. "练口语") — routes directly.

## Dynamic Today's Tasks (Primary View)

When practice is triggered, check for today's orchestrator-generated tasks first:

1. Query today's tasks:

```
db name=learner sql="SELECT id, task_type, skill, mode, callback, load_score, completed FROM daily_tasks WHERE date = date('now') ORDER BY CASE task_type WHEN 'primary' THEN 1 WHEN 'review' THEN 2 WHEN 'consolidation' THEN 3 END"
```

2. Query today's consumed load:

```
db name=learner sql="SELECT COALESCE(SUM(load_score), 0) as consumed FROM samples WHERE created_at >= date('now') AND load_score > 0"
```

3. Read MEMORY for Daily Load budget.

4. **If tasks exist**, show the dynamic training hub:

```
🎯 今日训练  (负荷 ▓▓▓░░░░░░░ {{consumed}}/{{budget}})

🔴 主项 · {{primary_desc}} {{primary_done}}
🟡 复习 · {{review_desc}} {{review_done}}
🟢 巩固 · {{consolidation_desc}} {{consolidation_done}}

{{load_warning}}

[KEYBOARD:
🔴 {{primary_label}}={{primary_cb}} | 🟡 {{review_label}}={{review_cb}}
🟢 {{consolidation_label}}={{consolidation_cb}}
📚 自选菜单=nav:menu_full | 📖 延展轨=nav:menu_ext
📊 画像=assessment | 🎯 驱动详情=report_focus
]
```

- `{{done}}`: ✅ if completed, empty otherwise
- `{{load_warning}}`: if consumed ≥ budget × 0.8, show "⚠️ 负荷接近上限 — 建议做延展轨或复习"

5. **If no tasks exist** (orchestrator hasn't run yet today), fall back to the static menu (`nav:main`).

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

- `main` → `nav:menu_full` — 全技能自选菜单
- `writing` → 写作模式选择
- `speaking` → 口语模式选择
- `listening` → 听力模式选择
- `reading` → 阅读模式选择
- `menu_ext` → 延展轨菜单（泛读 / 泛听 / 影子跟读）

## Rules

1. **Dynamic hub is the default view.** Only fall back to static menu if no daily_tasks exist.
2. **Menu is pure data** — lives in `templates/menu.json`, not in this file.
3. **One message, edit in-place** — no new messages for page transitions.
4. **`nav:` = zero LLM cost** — handled entirely by the adapter.
5. **Completed tasks** show ✅ but remain clickable (learner can redo).
6. **Load warnings** appear when near budget limit — never block the learner, just advise.
