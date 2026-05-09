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
   - If this invocation came from `/new`, call `persist` with `{"action":"session_start","session_key":"<current session id>","platform":"telegram","entrypoint":"new","plan":"<short string summary of what was recommended>"}` before sending the hub.
   - Read `templates/menu.json` with `skill_view name="planner" file="templates/menu.json"`.
   - Send **one** `tg_msg(type="keyboard")` message:
     - **Text**: a short Chinese recommendation (2–4 lines max) explaining what the learner should focus on right now and why — derived from `coach_context` (see "Recommendation text" below).
     - **Buttons**: `menu.json.main.buttons` **as-is**, unmodified. Do **not** generate extra recommendation buttons; the manual menu IS the entry point. The recommendation lives in the text above the buttons, not as duplicate buttons.
4. The adapter handles `nav:*` sub-pages directly after the first screen. It does not compute recommendations.

## Recommendation text

Use only data returned by `coach_context`; do not use the `db` tool. Pick **at most 1–2** reasons to mention; do not list every signal.

Priority for what to surface in the text:

1. If `due_tasks` has unfinished tasks → mention them first ("还有 N 个任务没完成").
2. Else if `due_words_count > 0` → "N 个词到期复习".
3. Else if `summary.subcaps` has a clearly weak dimension → name it briefly in plain Chinese ("最近连读漏词偏多" / "动词时态变化容易丢")
4. Else if `summary.errors` has a high-frequency pattern → "最近常错 X，可以做错题答疑".
5. Else (no signal) → suggest a low-friction default like 今日阅读 or 词汇复习, in one sentence.

**Wording**: 2-4 lines, conversational, no bullet list, no "✨ 智能推荐 1. 2." numbered headers, no minutes estimates. Example:

```
最近连读丢词比较多，建议先做几句精听练耳朵 🎧
也有 6 个词到期，等下可以顺手复习一下 📚

下面挑一个继续吧：
```

Then attach `menu.json.main.buttons` **unchanged** as the inline keyboard. Do not generate `vocab-review|...` style buttons inline — the menu already has them.

## Resources

- `templates/menu.json` — all menu pages (the only menu data in the package)
- `references/routing-table.md` — free-form text → skill map

## Rules

1. **Do not gate on bands.** Show the menu whether MEMORY is full or empty.
2. **`nav:*` is free** (adapter-handled); other callbacks cost one LLM turn.
3. **One manual menu source**: `templates/menu.json`. Use `main.buttons` unchanged — never inject extra recommendation buttons. The recommendation lives only in the message text above the buttons.
4. **Every sub-page has `← 返回|nav:main`.**
5. **First-run onboarding belongs to `profile-manager`.** Don't collect profile here.
6. **No raw DB access.** Recommendations read through `persist`, not `db`.
7. **Learning session lifecycle starts here.** `/new` opens a `study_sessions` row through `persist action="session_start"`; later learner-state/coach/session wrap-up may close it with `session_end`.
