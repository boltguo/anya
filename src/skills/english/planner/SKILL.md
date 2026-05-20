---
name: planner
description: "Smart recommendation: read the learner's recent signals and suggest what to focus on now."
---

# English Planner

Personalised recommendation. Invoked when the user taps "✨ 今日推荐" or types a free-form practice intent. Outputs a short, conversational suggestion — the main menu itself is rendered by the Telegram adapter, NOT by this skill.

This skill is **read-only**: it only reads `coach_context` and emits one Telegram message. It does NOT open study sessions, write `samples`, or touch MEMORY. (Study sessions are auto-opened by `persist action="practice"` the moment the first real practice row is written.)

## When to Use

- Callback `planner` (the 今日推荐 button on the main menu)
- Free-form text like `练习什么 / 学什么好 / 给我个建议`

If the learner names a specific mode (e.g. "听写"), match against `references/routing-table.md` and jump straight to that skill — skip the recommendation.

## Workflow

Onboarding gating is owned by `/new` (via `config.onboarding.{profile_done,placement_done}`); planner assumes the learner is already onboarded.

1. If the user named a specific mode, route via `references/routing-table.md`.
2. Otherwise:
   - Call `persist` with `{"action":"coach_context","days":14,"limit":8}`.
   - Send **one** `tg_msg(type="render")` (text + buttons, no `url`) with:
     - `text`: the recommendation (see "Recommendation text" below).
     - `buttons`: `[["🧭 主菜单|nav:main"]]`. The user picks the actual skill from the menu.

## Recommendation text

Use only data returned by `coach_context`; do not use the `db` tool. Pick **at most 1–2** reasons to mention; do not list every signal.

Priority for what to surface in the text:

1. If `due_words_count > 0` → "N 个词到期复习".
2. Else if `summary.subcaps` has a clearly weak dimension → name it briefly in plain Chinese ("最近连读漏词偏多" / "动词时态变化容易丢").
3. Else if `summary.errors` has a high-frequency pattern → "最近常错 X，可以做错题答疑".
4. Else if `personal_error_cards` has unmastered items → "上次的错误句还没消化，要不顺手复习一下".
5. Else (no signal) → suggest a low-friction default like 今日阅读 or 词汇复习, in one sentence.

**Wording**: 2-4 lines, conversational, no bullet list, no "✨ 智能推荐 1. 2." numbered headers, no minutes estimates. Example:

```
最近连读丢词比较多，建议先做几句精听练耳朵 🎧
也有 6 个词到期，等下可以顺手复习一下 📚

下面挑一个继续吧：
```

## Resources

- `references/routing-table.md` — free-form text → skill map

## Rules

1. **Do not render the menu.** The Telegram adapter owns menu rendering. Recommendation text only, with a single `🧭 主菜单|nav:main` button.
2. **`nav:*` is free** (adapter-handled); other callbacks cost one LLM turn.
3. **First-run onboarding belongs to `profile-manager`.** Don't collect profile here.
4. **No raw DB access.** Recommendations read through `persist`.
5. **No writes.** This skill is read-only: no `session_start`, no `practice`, no MEMORY edits.
6. **All Telegram sends go through `tg_msg type="render"`.** Never use stand-alone `text` / `keyboard` calls.
