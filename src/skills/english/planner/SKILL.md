---
name: planner
description: "Smart recommendation: read the learner's recent signals and suggest what to focus on now."
---

# English Planner

Personalised recommendation. Invoked when the user taps "✨ 今日推荐" or types a free-form practice intent. Outputs a short, conversational suggestion — the main menu itself is rendered by the Telegram adapter, NOT by this skill.

## When to Use

- Callback `planner` (the 今日推荐 button on the main menu)
- Free-form text like `练习什么 / 学什么好 / 给我个建议`
- Cron-triggered proactive nudges (Workflow B below)

If the learner names a specific mode (e.g. "听写"), match against `references/routing-table.md` and jump straight to that skill — skip the recommendation.

## Workflow

Onboarding gating is owned by `/new` (via `config.onboarding.{profile_done,placement_done}`); planner assumes the learner is already onboarded.

1. If the user named a specific mode, route via `references/routing-table.md`.
2. Otherwise:
   - Call `persist` with `{"action":"coach_context","days":14,"limit":8}`.
   - Call `persist` with `{"action":"session_start","session_key":"<current session id>","platform":"telegram","entrypoint":"planner","plan":"<short summary>"}`.
   - Send **one** `tg_msg(type="render")` (text + buttons, no `url`) with:
     - `text`: the recommendation (see "Recommendation text" below).
     - `buttons`: a single row — `[["🧭 主菜单|nav:main"]]`. The user picks the actual skill from the menu.

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

## Workflow B — Proactive Nudge (cron-triggered)

When triggered by cron (not user), evaluate nudge triggers. Most runs should produce **no message** — silence is valid.

1. Read `MEMORY.md` and `persist action="coach_context"` for the last 7 days.
2. Evaluate triggers in `references/triggers.md` in priority order.
3. If none fire, output `[SILENT]` and stop.
4. If one fires, send a short message (≤ 4 sentences) with exactly one action button via `tg_msg type="render"` (text + buttons, no `url`).
5. Record the push with `persist action="practice"`, `skill_type="planner.proactive"`, `section="coaching"`, `completed=1`, `load_score=0`.

**Nudge rules**:
- **One Focus**: exactly one high-ROI task per nudge. No laundry list.
- **No Data Dumps**: weave data into a natural Chinese sentence.
- **No MEMORY writes.** `learner-state` owns durable ability-state updates.
- **No repeated nudges.** Record every sent push so later runs can avoid repeating it.

## Resources

- `references/routing-table.md` — free-form text → skill map
- `references/triggers.md` — proactive nudge trigger catalogue

## Rules

1. **Do not render the menu.** The Telegram adapter owns menu rendering. Recommendation text only, with a single `🧭 主菜单|nav:main` button.
2. **`nav:*` is free** (adapter-handled); other callbacks cost one LLM turn.
3. **First-run onboarding belongs to `profile-manager`.** Don't collect profile here.
4. **No raw DB access.** Recommendations read through `persist`.
5. **`session_start` lives here.** The planner invocation opens a `study_sessions` row; learner-state may close it with `session_end`.
6. **All Telegram sends go through `tg_msg type="render"`.** Recommendation + menu button and proactive nudge + action button both use render. Never use stand-alone `text` / `keyboard` calls.
