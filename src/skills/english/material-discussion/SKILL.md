---
name: material-discussion
description: "Topic discussion with authentic materials. Trigger for '话题讨论', '聊聊', 'discuss', 'talk about', or when the user wants to read something interesting and discuss it."
---

# Material Discussion (话题讨论)

Read authentic content → discuss it in English. **Output-focused**: the reading is input, the discussion is the exercise.

## 1. Inputs

Trigger when:

- User says: `话题讨论`, `聊聊`, `discuss`, `talk about`, `读点什么`, `有什么有趣的`.
- Callback `material-discussion`.
- Planner routes here for balanced reading + speaking practice.

Required context before generating:

1. `persist {"action":"recent_practice","session_id":"<session>","skill_type":"speaking.discussion","limit":20}` for dedup.
2. `persist {"action":"coach_context","days":14,"limit":8}` for subcaps / errors. Slow signal — only re-call when tier changes.
3. `MEMORY.md` / `USER.md` for interests and level.

## 2. Difficulty Policy

| Tier | Material length | Discussion depth |
|---|---|---|
| Beginner (< 5.0) | 80–120 words, simple news | State opinion + 1 reason |
| Intermediate (5.0–6.0) | 120–180 words, opinion piece | Compare views + give example |
| Advanced (≥ 6.5) | 180–250 words, editorial/analysis | Argue + concede + counter |

## 3. Flow

### State A: Source & Present

1. Check user's interests from `USER.md`. Use `web_search` to find a recent, interesting short article/thread.
2. **Send the material FIRST** via `tg_msg type="render"` (text only, no `url`/`buttons`):
   - English excerpt (adapted to tier length)
   - 2-3 key phrases **bolded** in the English text
   - Chinese summary hidden: `||中文摘要：...||` (user taps to reveal if needed — don't show directly. `||...||` expands to `<tg-spoiler>`)
3. **THEN send the discussion question + buttons** via `tg_msg type="render"` (text + buttons, no `url`):
   - `text`: a thought-provoking discussion question in Chinese: e.g. `💬 你觉得 AI 会取代程序员吗？用英文说说你的看法（中文也行，我帮你翻）`
   - `buttons`:

   ```json
   [["🆘 看不懂|discussion_help", "👋 结束讨论|discussion_end"]]
   ```

### State B: SOS & Discussion Loop

`discussion_help`:

- Send **text-only** scaffolding via `tg_msg type="render"` (text only, no `url`/`buttons`):
  - 3 key vocabulary items with Chinese gloss
  - 1-2 sentence starters the user can use
  - Example: `试试这样说：I think AI can/cannot replace programmers because...`
- Wait for user's next response.

**Discussion loop** (until user taps `👋 结束讨论` or max 5 turns):

1. Accept user's response (voice or text). If in Chinese, **recast** their point in natural English and ask them to try again.
2. Respond with 1 follow-up or gentle push-back, referencing the source material.
3. **Stealth correction**: if the user makes a significant expression error, use recasting (repeat their thought in correct English naturally in your reply).
4. Send response via `tg_msg type="render"` (text + buttons, no `url`) with the same 2 buttons:

   ```json
   [["🆘 看不懂|discussion_help", "👋 结束讨论|discussion_end"]]
   ```

### State C: Feedback & Persist

When user taps `👋 结束讨论` (`discussion_end` callback) or max 5 turns reached:

1. Grade on `accuracy` rubric (0..1):
   | Score | Rubric |
   |---|---|
   | `1.00` | Sustained discussion + referenced source + advanced phrasing |
   | `0.70` | Engaged meaningfully, basic but clear opinions |
   | `0.40` | Minimal engagement or mostly Chinese |
   | `0.00` | Refused / off-topic |

2. **Persist FIRST, THEN feedback.**

3. Feedback via **ONE** `tg_msg type="render"` (text + buttons, no `url`):
   - `text`: score + brief evaluation, 1 thing they did well (specific quote), 1 upgrade (原句 → 升级版 → 原因), 1-2 phrases from the source worth remembering
   - `buttons`: `[["🔄 换个话题再聊|discussion_next", "🧭 练习其他|nav:main"]]`
   - On **perfect** (`accuracy === 1.0`) add `react: "🔥"` to the same call.

### State D: Persist Evidence

```json
{
  "skill_type": "speaking.discussion",
  "session_id": "<session>",
  "prompt": "<source excerpt + discussion question>",
  "prompt_hash": "<sha1 first 16 chars>",
  "response": "<full discussion transcript>",
  "accuracy": 0.70,
  "raw_score": 0.70,
  "max_score": 1,
  "feedback": "<EN: engagement + source-referencing verdict + 1 upgrade>",
  "section": "speaking",
  "domain": "speaking",
  "load_score": 2,
  "minutes": 3,
  "mode": "study",
  "ui_feedback": "<button labels if any>",
  "metadata": "{\"tier\":\"intermediate\",\"topic\":\"ai_replacing_jobs\",\"source_words\":150,\"turns_completed\":3}",
  "errors": "[{\"key\":\"l1_transfer\",\"category\":\"speaking\",\"severity\":\"medium\",\"original\":\"I very like\",\"correction\":\"I really like\",\"note\":\"Chinese word-order transfer.\"}]",
  "subcap_scores": "[{\"key\":\"speaking.fluency\",\"score\":6.5,\"evidence\":\"Engaged but paused frequently.\"},{\"key\":\"reading.gist\",\"score\":7.0,\"evidence\":\"Understood main point of source.\"}]"
}
```

## 4. Hard Rules

1. **Chinese summary uses spoiler.** Every source excerpt must include a `<tg-spoiler>` Chinese summary — never show Chinese directly (the user should try to read English first).
2. **Recast, don't correct.** Use the recasting technique for errors — repeat their point in correct English naturally.
3. **Source-grounded.** At least 1 push-back per discussion must reference the source material.
4. **No forced keyboard.** The user engages at their own pace.
5. **TTS optional.** Only use TTS for the discussion question if voice practice is the goal. Don't TTS the source article.
6. Use `persist` for reads/writes; no raw DB.
7. Don't update `MEMORY.md`; `learner-state` owns durable ability state.
8. **All Telegram sends go through `tg_msg type="render"`.** Source delivery, discussion turn, SOS scaffold, feedback + buttons + perfect-score `react: "🔥"` all fold into render calls. Never split into separate `text` / `keyboard` / `react` calls.
