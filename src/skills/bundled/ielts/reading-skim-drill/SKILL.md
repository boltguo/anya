---
name: reading-skim-drill
description: "90-second skim then hide the passage, answer main-idea + function questions from memory."
---

# Reading Skim Drill

Breaks word-by-word translation habit. Forces big-picture reading.

## When to Use

- `略读 / 快速浏览 / skim`
- Callback `reading-skim-drill`
- `reading.pace ≤ 5.5` AND `reading.gist ≤ 5.5`

## Skim window

| Band | Words | Skim |
| ---- | ----- | ---- |
| < 5.5 | 300-400 | 90 sec |
| 5.5-6.5 | 450-550 | 75 sec |
| 6.5+ | 550-650 | 60 sec |

## Workflow

1. Send passage wrapped in `<blockquote expandable>`.
2. Announce skim window. `[开始|skim_start]` — mark start time.
3. After `seconds` elapse (checked when learner submits): `tg(type:"edit", message_id:"passage", text:"📖 已隐藏 — 凭记忆回答")`.
4. Main-idea question: `force_reply` "一句话说主旨（≤ 15 字）".
5. 3-4 paragraph-function `quiz` questions (one per paragraph).
6. 1 detail-trap MCQ (wrong-but-plausible keyword match).
7. Reveal passage again with paragraph-function labels as `<tg-spoiler>` tags.

## Persist

- 1 `samples` row (`load_score=2`, `feedback={skim_sec, gist_correct, function_correct, trap_correct, wpm}`).
- `subcap_scores.reading.gist` + `.pace` + `.argument_structure`.
- `errors`: `speed_too_slow` if overtime by > 20%; `keyword_matching_error` for trap miss.

Queries: `support/ielts-data-contract/references/queries.md`.

## Rules

1. **Hide is sacred** — no re-viewing until after grading.
2. **Time the skim** — compute wpm from word count / skim window.
3. **One main-idea + 3-4 function + 1 trap.**
4. **Reveal with spoilers** for interactive debrief.
