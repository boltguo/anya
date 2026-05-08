---
name: profile-manager
description: "Build or update the learner's USER.md profile; also the /profile-manager command and first-run onboarding dispatcher."
---

# Profile Manager

Owner of `USER.md`. Builds or corrects a short natural-language user profile. On first-run (or `/profile-manager`), also dispatches the full onboarding: profile → `placement-quick` → `planner`.

## When to Use

- `/profile-manager` command
- `USER.md` still contains `initialized: false`
- `建档 / 重新建档 / 改目标 / 换考试日期 / update profile / 我换工作了`
- Another skill needs profile context that is still missing
- `我的 USER 里是什么 / show my profile`

## Workflow

0. **Bootstrap study.db** — call `persist` with `{"action":"coach_context","days":1,"limit":3}` to ensure the database and schema exist and to see any existing structured profile mirror.
1. Read `USER.md` + `MEMORY.md`.
2. Decide mode:
   - **First-run** (`initialized: false` or `/profile-manager` with an empty profile) → collect the question bundles in `references/fields.md`, one bundle per turn. After enough information is collected, rewrite `USER.md` as concise natural-language sections and set `initialized: true` in **BOTH** `USER.md` and `MEMORY.md`. Then chain `placement-quick` (or `placement-quick` if asked). Hand off to `planner`.
   - **Targeted update** — parse intent, ask at most one clarifying question, then rewrite the relevant natural-language section.
   - **Profile lookup** — another skill reads USER via `memory target=user action=read`; this path rarely runs directly.
3. Write `USER.md` through `memory target=user action=replace`.
4. Mirror structured planning fields through `persist action="profile_upsert"` when profile facts are collected or changed. Use any existing `coach_context.profile` values to avoid asking for facts that are already stored.

## Resources

- `references/fields.md` — required field list + question bundles + accepted shortcuts

## Rules

1. **Never ask for information that is already clearly present.**
2. **One question per turn.** Send one `tg_msg` call (keyboard or force_reply), then **stop and wait**. The user's reply triggers the next loop iteration.
3. **Buttons are shortcuts, not required.** The user can always type free text instead.
4. **Dates should be clear.** Prefer ISO `YYYY-MM-DD` when the user gives a real exam date. If not decided, write that it is not decided.
5. **Do NOT compute bands.** That's `learner-state`.
6. **Only first-run mode chains placement.** Update and lookup modes do not.
