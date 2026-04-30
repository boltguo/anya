---
name: profile-manager
description: "Build or update the learner's USER.md profile; also the /profile-manager command and first-run onboarding dispatcher."
---

# Profile Manager

Owner of `USER.md`. Collects or corrects profile fields. On first-run (or `/profile-manager`), also dispatches the full onboarding: profile → `placement-quick` → `ielts-router`.

## When to Use

- `/profile-manager` command
- `USER.initialized = false`
- `建档 / 重新建档 / 改目标 / 换考试日期 / update profile / 我换工作了`
- Another skill needs a single profile field that is `(not set)`
- `我的 USER 里是什么 / show my profile`

## Workflow

0. **Bootstrap study.db** — call `db name=study sql="SELECT 1"` to ensure the database and schema exist (auto-created from `templates/study.sql` on first access).
1. Read `USER.md` + `MEMORY.md`.
2. Decide mode:
   - **First-run** (`USER.initialized = false` or `/profile-manager` with empties) → collect the field bundles in `references/fields.md`, one bundle per turn. After all required fields are filled, set `Status.initialized = true` and chain `placement-quick` (or `placement-quick` if asked). Hand off to `ielts-router`.
   - **Targeted update** — parse intent, ask at most one clarifying question, write only the affected field.
   - **Single-field lookup** — another skill reads USER via `memory target=user action=read`; this path rarely runs directly.
3. All writes through `memory target=user action=replace`.

## Resources

- `references/fields.md` — required field list + question bundles + accepted shortcuts

## Rules

1. **Never ask for a field already set.**
2. **One question per turn.** Send one `tg` call (keyboard or force_reply), then **stop and wait**. The user's reply triggers the next loop iteration.
3. **Buttons are shortcuts, not required.** The user can always type free text instead.
4. **Dates are stored as ISO `YYYY-MM-DD`.** Convert relative dates. "还没定" → `(not set)`.
5. **Do NOT compute bands.** That's `learner-state`.
6. **Only first-run mode chains placement.** Update and lookup modes do not.
