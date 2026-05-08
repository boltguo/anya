---
name: reading-skim-drill
description: "90-second skim then hide the passage, answer main-idea + function questions from memory."
---

# Reading Skim Drill

## Adaptive Binding

Read MEMORY and apply:

| MEMORY parameter | Controls |
|---|---|
| `Band Snapshot.Reading` | Match scaling table below |
| `Adaptive Training Controls.reading_text_length` | Override word count if set (e.g. `200`) |
| `Vocabulary Profile.cefr` | Cap passage vocabulary at this CEFR level |
| `Weak Dimensions.Reading` | Focus questions on the weakest reading subcap |

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
3. After `seconds` elapse (checked when learner submits): `tg_msg(type:"edit", message_id:"passage", text:"📖 已隐藏 — 凭记忆回答")`.
4. Main-idea question: `force_reply` "一句话说主旨（≤ 15 字）".
5. 3-4 paragraph-function `quiz` questions (one per paragraph).
6. 1 detail-trap MCQ (wrong-but-plausible keyword match).
7. Reveal passage again with paragraph-function labels as `<tg-spoiler>` tags.

## Persist

**Follow `support/data-contract/references/post-practice-protocol.md` for all writes.** Do NOT update MEMORY.md — `learner-state` skill handles that.

1. **`samples`** row:
   - `skill_type = 'reading.skim'`
   - `prompt` = the passage text
   - `response` = user's answers (gist + quiz responses)
   - `accuracy` = correct / total (0.0–1.0)
   - `raw_score` = correct count, `max_score` = question count
   - `load_score = 2`
   - `feedback` = A concise but detailed textual analysis of this specific attempt. Write about what exactly the user missed, the root cause, and overall performance. Do NOT use JSON.
     Example: "The user struggled with relative clauses and vocabulary precision, but maintained good overall flow."

2. **`errors`** — from `references/error-keys.md`: `keyword_matching_error`, `time_pressure_skip`

3. **`subcap_scores`**: `reading.gist`, `reading.pace`, `reading.argument_structure`

4. **`activity_log`** — upsert today

Queries: `support/data-contract/references/queries.md`.

## Rules

1. **Hide is sacred** — no re-viewing until after grading.
2. **Time the skim** — compute wpm from word count / skim window.
3. **One main-idea + 3-4 function + 1 trap.**
4. **Reveal with spoilers** for interactive debrief.
5. **Telegram hiding**: Send passage inside `<blockquote expandable>`, then after skim time use `tg_msg(type=edit)` to replace passage message with "📖 已隐藏". If edit fails, send a long separator message to push the passage out of view.
6. **Never re-send the full passage** until grading is complete.
