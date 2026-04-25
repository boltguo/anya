---
name: speaking-freetalk
description: "Open 60-120 sec spoken monologue with focused feedback on fluency + one language upgrade."
---

# Speaking Freetalk

Low-pressure, no 4-criterion report. Goal: get the learner talking.

## When to Use

- `自由说 / 随便说说 / freetalk / 聊一个话题`
- Callback `speaking-freetalk`
- Coach suggests a light warm-up / re-entry
- `streak_break` re-entry task

## Adaptive Binding

Read MEMORY and apply:

| MEMORY parameter | Controls |
|---|---|
| `IELTS Bands.Speaking` | `< 5.0` → simple daily topics, accept 30s; `5.0-6.0` → opinion topics; `6.0+` → abstract/hypothetical |
| `Adaptive Training Controls.speaking_complexity` | Guide topic abstraction level if set |
| `Vocabulary Profile.cefr` | Feedback vocabulary ceiling (don't use C2 feedback for a B1 learner) |
| `Weak Dimensions.Speaking` | Focus feedback on the weakest dimension |

## Workflow

1. Offer 3 topic choices aligned with `Content Profile.engage` (plus `🎲 给我一个`).
2. `tg(type:"force_reply", text:"聊 90 秒，先想 10 秒再开始。发语音给我。")`.
3. Transcribe; measure pause + filler + duration. Call `pron_assess` only if pronunciation is flagged weak.
4. Feedback — 3 tight parts: 流利度 / 亮点表达 / 一句升级（原句 → 升级 → 原因）.
5. One optional 20-sec micro-drill using the upgraded sentence (skip for clearly 6.5+).
6. Persist: `samples` (load_score=2), subcap scores (`fluency_pauses`, `lexical_variety`), auto-harvest the upgrade chunk.
7. Difficulty keyboard + `[🔁 speaking-freetalk]  [🏠 nav:main]`.

Queries: `support/ielts-data-contract/references/queries.md`.

## Rules

1. **Low pressure.** No "扣分" language.
2. **One topic per session.**
3. **≤ 120 sec target.** Feedback covers first 2 minutes.
4. **One upgrade.** More is noise.
5. **Skip `pron_assess`** when pronunciation isn't flagged weak.
6. **Persist every session** even if abandoned.
7. **Short voice (< 30 sec)**: Don't grade yet. Encourage: "再多说一点，想到什么说什么 👇" with another `force_reply`. Concatenate both transcripts for grading.

## Persist

**Follow `support/ielts-data-contract/references/post-practice-protocol.md` for all writes.** Do NOT update MEMORY.md — cron handles that via `learner-state`.
