---
name: planner
description: "Training hub for English practice: smart recommendations, menu, and free-form routing."
---

# English Planner

Central hub. On `/new` or menu requests, show one screen with smart recommendations at the top and the manual menu underneath. For free-form text, pattern-match to the right skill.

## When to Use

- `练习 / 学习 / menu / 返回菜单 / practice`
- Callback `menu` or any free-form "I want to practice X"
- A sub-skill finishes and the learner is back with no specific intent

If the learner names a specific mode (e.g. "听写"), jump straight to that skill — skip the menu.

## Workflow

1. If `USER.md` still contains `initialized: false` → hand off to `profile-manager` (it chains placement + returns here).
2. If the user named a specific mode, match against `references/routing-table.md`; if matched → `skill_view` + execute that skill.
3. Otherwise render the training hub:
   - Call `persist` with `{"action":"coach_context","days":14,"limit":8}`.
   - If this invocation came from `/new`, call `persist` with `{"action":"session_start","session_key":"<current session id>","platform":"telegram","entrypoint":"new","plan":"<JSON summary of recommended buttons/menu>"}` before sending the hub.
   - Read `templates/menu.json` with `skill_view name="planner" file="templates/menu.json"`.
   - Choose up to 3 smart recommendations, then send one `tg_msg(type="keyboard")` message.
   - Put smart recommendation buttons first, then append `menu.json.main.buttons`.
4. The adapter handles `nav:*` sub-pages directly after the first screen. It does not compute recommendations.

## Smart Recommendation Rules

Use only data returned by `coach_context`; do not use the `db` tool.

Priority order:

1. If `due_tasks` has unfinished tasks, recommend their `callback` or `skill` first.
2. If `due_words_count > 0`, recommend `vocab-review`.
3. If `summary.subcaps` has a weak dimension, recommend a related skill:
   - `listening.*` → `listening-dictation`
   - `reading.*` → `reading-deepdive`
   - `writing.*grammar*` or `writing.*sentence*` → `writing-builder`
   - other `writing.*` → `writing-rewrite`
   - `speaking.*pronunciation*` → `speaking-shadowing`
   - `speaking.*fluency*` or `speaking.*interaction*` → `speaking-freetalk`
   - other `speaking.*` → `speaking-repeat`
4. If `summary.errors` has a high-frequency pattern, recommend `error-clinic`.
5. If there is still no useful signal, recommend `daily-article`.

Keep recommendation text short: one reason per slot. Example:

```
✨ 智能推荐
1. 📚 词汇复习 · 8 min
   12 个词/短语到期
2. ✏️ 句子精听 · 10 min
   listening.connected_speech 均分偏低

也可以自选方向：
```

Use button format `["✨ 8m 📚 词汇复习|vocab-review"]`. Every recommended callback must be a real skill slug or `nav:*`.

## Resources

- `templates/menu.json` — all menu pages (the only menu data in the package)
- `references/routing-table.md` — free-form text → skill map

## Rules

1. **Do not gate on bands.** Show the menu whether MEMORY is full or empty.
2. **`nav:*` is free** (adapter-handled); other callbacks cost one LLM turn.
3. **One manual menu source**: `templates/menu.json`. Smart recommendation buttons are generated at runtime from `persist coach_context`.
4. **Every sub-page has `← 返回|nav:main`.**
5. **First-run onboarding belongs to `profile-manager`.** Don't collect profile here.
6. **No raw DB access.** Recommendations read through `persist`, not `db`.
7. **Learning session lifecycle starts here.** `/new` opens a `study_sessions` row through `persist action="session_start"`; later learner-state/coach/session wrap-up may close it with `session_end`.
