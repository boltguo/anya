---
name: reading-skim-drill
description: "Timed-skim then hide the passage, answer main-idea + paragraph-function questions from memory. Trigger for '略读', '快速浏览', 'skim'."
---

# Reading Skim Drill

Speed-reading drill. One passage at a time: announce skim window, hide the passage at the timeout, ask a main-idea question + 3-4 paragraph-function questions + 1 detail trap, persist, then adapt the next passage by i+1.

## 1. Inputs

Trigger when:

- User says: `略读`, `快速浏览`, `skim`, `提速`, `读得太慢`.
- Callback `reading-skim-drill`.
- Planner/coach routes here for weak `reading.pace ≤ 5.5` AND `reading.gist ≤ 5.5`.

Required context before generating:

1. `persist {"action":"recent_practice","session_id":"<session>","skill_type":"reading.skim","limit":20}` (`limit` int). Returns rows + `recent_prompt_hashes`. Source of truth for §2.3 credit and §2.4 dedup; do not duplicate hashes in `metadata`.
2. `persist {"action":"coach_context","days":14,"limit":8}` for subcaps / errors / weak reading dimension. Slow signal — only re-call when tier changes.
3. `MEMORY.md` / `USER.md` only as fallback. No raw `study.db` access.

## 2. Difficulty Policy

Target **i+1**: one stretch above the learner's last successful skim. Adapt word count, skim seconds, topic abstraction; never combine multiple stretches in one round.

### 2.0 Constants & Tier

| Constant | Value | Meaning |
| --- | --- | --- |
| `PASS_THRESHOLD` | `0.70` | A round with `accuracy ≥ PASS` is a pass. |
| `FAIL_THRESHOLD` | `0.40` | Below = fail; `[FAIL, PASS)` = "hold". |
| `STREAK` | `2` | Passes/fails to move tier. |
| `ACC_WINDOW` | `3` | Sample window for §2.2 mean. |
| `DEDUP_WINDOW` | `20` | Rolling `prompt_hash` window. |

`accuracy` = (correct items) / (total items). Total items = 1 main-idea + 3-4 paragraph-function + 1 detail trap = **5 or 6**. Main-idea is graded against a rubric (1.00 / 0.50 / 0.00), paragraph-function and trap are binary (1 / 0).

| Tier (IELTS band ≈ CEFR) | Words | Skim window | Topic |
| --- | --- | --- | --- |
| Beginner (< 5.5 ≈ A1–B1) | 300–400 | 90 sec | Daily life, narrative |
| Intermediate (5.5–6.5 ≈ B1–B2) | 450–550 | 75 sec | Argumentative, news |
| Advanced (≥ 6.5 ≈ B2+) | 550–650 | 60 sec | Academic / opinion-led, dense nominalization |

**Reading the learner's level from `MEMORY.md`** (do NOT confuse capability score 0–100 with IELTS band 0–9):

1. Prefer `Band Snapshot.Reading` (CEFR string). Map: `A1`/`A2` → Beginner, `B1` → Beginner→Intermediate boundary (start Beginner), `B2`/`C1`/`C2` → Advanced.
2. Boundary suffix (`A2+`, `B1-`): **降一级起步**.
3. If CEFR missing, fall back to `Adaptive Training Controls.reading_text_length` if set; else 14-day `reading.pace` average from `coach_context.summary.subcaps` (0–10) and use the tier table.
4. **Never** read `Core Capabilities.Reading: <n>/100` as IELTS band — that's a 0–100 capability score.
5. `Vocabulary Profile.cefr` caps passage vocabulary at the learner's CEFR level regardless of tier.

### 2.2 Recent-accuracy

Mean `accuracy` over last `ACC_WINDOW` `completed=1` rows of current `session_id` + `skill_type`. Abandoned (`completed=0`) excluded from mean but count as fail for `demotion_credit`.

Fallback chain when fewer than `ACC_WINDOW` rows: 14-day mean from `coach_context.summary` → `MEMORY.md` band − 1 tier at shortest passage → Beginner 300-word/90-sec. Never guess upward.

### 2.3 Credit gating

```
promotion_credit = walk recent_practice.rows newest→oldest (skip redo_count>0):
  count consecutive accuracy ≥ PASS; reset on any fail (< FAIL or completed=0); holds ([FAIL, PASS)) pass through.
demotion_credit = mirror: count consecutive fail; reset on any pass; holds pass through.
abandoned (completed=0) = 1 fail.
```

| Credit | Action |
| --- | --- |
| `promotion_credit ≥ STREAK` at tier ceiling (max words for tier) | Promote tier; reset both credits; start at next tier's shortest passage. |
| `promotion_credit ≥ STREAK` inside tier | Words **+50** (clamped to tier max); skim window proportionally tightened (−5s); reset `promotion_credit`. |
| `demotion_credit ≥ STREAK` at tier floor | Demote tier; reset both credits; start at prev tier's longest passage. |
| `demotion_credit ≥ STREAK` inside tier | Words **−50** (clamped to tier min); skim window relaxed (+5s); reset `demotion_credit`. |
| `skim_hard` tap | Persists abandoned row (State B); surfaces as fail next call. |

Retry rows (`redo_count > 0`) skipped from credit; still count for dedup.

Hold: keep word count + skim window, swap topic family to probe a different weakness.

`wpm` (passage_words / actual_skim_seconds) is recorded into `metadata` for monitoring but does NOT participate in gating — gating uses `accuracy` only.

### 2.4 Generation

- Pick a topic that overlaps the user's interests (`USER.md`/`MEMORY.md`) when known; otherwise default to a general-interest topic appropriate for the tier.
- Stretch **at most one** dimension per round: words, skim seconds, topic abstraction.
- Reject any passage whose `prompt_hash` ∈ `recent_practice.recent_prompt_hashes`.
- Don't repeat the same topic family for 2+ consecutive rounds.

## 3. Flow

### State A: Prepare And Deliver

1. From §2.3 + `coach_context`, decide tier, word count, skim window, topic.
2. Generate the passage at chosen length / topic. Compute `prompt_hash`; regenerate on dedup hit. Make sure each paragraph has a distinct discourse function (claim / example / counter / conclusion) so paragraph-function questions are answerable.
3. Send the passage in a `tg_msg type="text"` call wrapped in `<blockquote expandable>...</blockquote>`. Save the returned `message_id` as `passage_msg_id` for the hide step.
4. Send a separate `tg_msg type="keyboard"` (no media) with text + start button:

   Text:

   ```text
   📖 这段大约 {words} 词。点 "开始计时" 后你有 {seconds} 秒略读，时间到我会自动隐藏原文，凭印象答题。
   ```

   Buttons:

   ```json
   [["▶️ 开始计时|skim_start", "😵 完全读不懂|skim_hard"]]
   ```

5. Init empty `ui_feedback` accumulator.

### State B: Button Handling (before answering)

`skim_start`:

- Append `▶️ 开始计时` to `ui_feedback`.
- Record `start_ts = now()`.
- After `seconds` elapse (checked when learner submits OR via a wake — implementation may schedule an edit; see Hard Rule 5), edit the passage message: `tg_msg type="edit" message_id=passage_msg_id text="📖 已隐藏 — 凭记忆回答"`. If edit fails, send a long separator `tg_msg type="text" text="\\n\\n\\n📖 已隐藏 — 凭记忆回答\\n\\n\\n"` to push the passage out of view.
- Send the main-idea prompt as `tg_msg type="force_reply" text="一句话说主旨（≤ 15 字）"`.

`skim_hard`:

1. **Persist abandoned record FIRST**:

   ```
   completed=0, accuracy=0, response="",
   feedback="Learner tapped '😵 完全读不懂' before answering. Treat as strong negative evidence at this tier/topic.",
   ui_feedback="😵 完全读不懂", load_score=0, minutes=0,
   metadata={"abandoned_reason":"too_hard","tier":"<beginner|intermediate|advanced>","words":<n>,"topic":"<topic>"}
   ```

   After `persist` returns, reset `ui_feedback`.

2. **Replacement.** Apply demotion (§2.3). Brief Chinese ack, generate a shorter / easier passage → State A.

After the main-idea reply lands, send 3-4 paragraph-function `quiz` questions (one per paragraph; e.g. "第 2 段的功能是 A. 提出反例 B. 总结 C. 引用数据 D. 类比"), then 1 detail-trap MCQ where the wrong answer is a plausible keyword match.

### State C: Evaluate

When all answers are in:

1. Grade main-idea against this rubric (use verbatim):

   | Score | Rubric |
   | --- | --- |
   | `1.00` | Captured the main thrust + pivot precisely. |
   | `0.50` | Captured a sub-idea or one supporting fact; missed the main thrust. |
   | `0.00` | Off-topic / no answer. |

2. Grade paragraph-function and trap MCQ binary (1 / 0).
3. `accuracy = (main_idea_score + sum(quiz_correct)) / total_items`.
4. Compute `wpm = words / actual_skim_seconds` (use 1 if elapsed > skim_window — clamp to skim_window for fair WPM).
5. **Persist FIRST, THEN feedback**. Sequential.

Reveal step (after persist + feedback): re-send the passage as a fresh `tg_msg type="text"` with each paragraph's function as a `<tg-spoiler>` label so the learner can self-debrief without re-reading the whole passage. The main-idea pivot phrase should also be wrapped in `<tg-spoiler>` so they can verify what carried it.

Feedback message must include:

- A brief Chinese evaluation: how many they got, where they got tricked (usually keyword-matching trap or pivot miss).
- The actual main idea in ≤ 15 字 (your own canonical answer).
- The paragraph-function map (1 line per paragraph).
- WPM line (e.g. `WPM: 285 (window: 75s, used: 70s)`).

Buttons (always, regardless of accuracy):

```json
[["🔁 再来一篇|skim_next", "🧭 练习其他|nav:main"]]
```

**Critical**: feedback + buttons in **one** `tg_msg type="keyboard"` call. The reveal `tg_msg type="text"` with spoilers can be a separate message before or after — but feedback+buttons must go together. Never `type="text"` then `type="edit"` to attach buttons.

### State D: Persist Evidence

Call `persist` with `action="practice"` (or omit `action`).

Minimum payload:

```json
{
  "skill_type": "reading.skim",
  "session_id": "<session>",
  "prompt": "<the full passage text>",
  "prompt_hash": "<sha1(normalized prompt) first 16 chars>",
  "response": "<the user's answers, structured: e.g. 'gist=讲气候政策的折衷; q1=B; q2=C; q3=A; trap=B'>",
  "accuracy": 0.80,
  "raw_score": 4,
  "max_score": 5,
  "feedback": "<IN ENGLISH for DB / learner-state> Got the main idea + 3 of 4 paragraph functions; fell for the keyword trap on the detail MCQ. WPM 285 in a 75s window — pace is healthy at this tier.",
  "section": "reading",
  "domain": "reading",
  "load_score": 2,
  "minutes": 2,
  "mode": "study",
  "ui_feedback": "<comma-joined exact button labels tapped this round, e.g. '▶️ 开始计时' — empty if none>",
  "metadata": "{\"tier\":\"intermediate\",\"words\":510,\"skim_window_sec\":75,\"actual_skim_sec\":70,\"wpm\":285,\"topic\":\"climate_policy\",\"trap_category\":\"keyword_match\",\"promotion_credit_after\":1,\"demotion_credit_after\":0}",
  "errors": "[{\"key\":\"keyword_matching_error\",\"category\":\"reading\",\"severity\":\"medium\",\"original\":\"\",\"correction\":\"\",\"note\":\"Picked the answer whose phrasing literally matched the passage rather than the answer matching the passage's meaning.\"}]",
  "subcap_scores": "[{\"key\":\"reading.gist\",\"score\":8.0,\"evidence\":\"Main idea captured precisely.\"},{\"key\":\"reading.pace\",\"score\":7.5,\"evidence\":\"WPM 285 in a 75s window for an intermediate-tier passage.\"},{\"key\":\"reading.argument_structure\",\"score\":7.0,\"evidence\":\"3 of 4 paragraph functions correct.\"}]"
}
```

`prompt_hash` = first 16 hex chars of `SHA-1(normalized prompt)`; normalize = lowercase + strip punctuation + collapse whitespace.

`ui_feedback` mandatory if any button was tapped.

State D persists fully-attempted passages only. Abandoned rows are written in State B.

### State E: Continue (`skim_next`)

- Re-call `persist action="recent_practice"` (§1) for credits + dedup.
- Apply §2.3 (skip `redo_count > 0`) before generating.
- Skip `coach_context` re-call unless tier changed.
- Generate next passage (State A step 1 — incl. dedup). Respect "no same topic family twice in a row" (§2.4).

## 4. Collaborates With

- `planner`: routes here when `reading.pace` / `reading.gist` is the highest-value drill.
- `learner-state`: reads persisted evidence; updates `MEMORY.md`.
- `coach`: uses errors / subcap scores to explain why they fell for the keyword trap or missed the pivot.
- `vocab-harvest`: post-passage, optionally extract 1-2 high-value collocations (don't go beyond — this skill is about pace, not vocab).
- `reading-deepdive`: graduates here once the user wants to slow down and parse syntax.
- `support/data-contract`: defines the `persist` write protocol.

## 5. Failure And Fallbacks

- `tg_msg type="edit"` fails → send the long separator block instead. Hide is sacred (Hard Rule 1).
- `force_reply` ignored → wait once more, then ask if they want to skip; if yes, write `completed=0`.
- User submits the gist BEFORE the skim window elapses → still grade; record `actual_skim_sec` < `skim_window_sec` (a fast skim is a real signal).
- User submits AFTER the skim window passed by > 30s → grade normally but record `actual_skim_sec = skim_window_sec` for fair WPM (otherwise WPM craters from idle time).
- `persist` fails → still send feedback, but say it was not saved.
- `<tg-spoiler>` is client-side; no callback. Don't invent `spoiler_used`.

## 6. Hard Rules

1. **Hide is sacred.** Once the skim window elapses, the passage is replaced with `📖 已隐藏 — 凭记忆回答` until grading is complete. Never re-send the full passage in plain view before grading.
2. **One main-idea + 3-4 paragraph-function + 1 detail trap.** Always 5 or 6 items total. No exceptions.
3. **Every reveal uses `<tg-spoiler>`** for paragraph-function labels and the pivot phrase. Lets the learner self-test even on review.
4. **WPM goes into metadata, not gating.** Pace is a watched signal but `accuracy` alone moves tier.
5. **Trap is plausible.** The wrong-answer MCQ option must literally keyword-match the passage but mean the wrong thing. That's the lesson of this skill.
6. Use `persist` for reads/writes; no raw DB.
7. Don't update `MEMORY.md`; `learner-state` owns durable ability state.
8. **One-call keyboard.** Reports + buttons go out in a single `tg_msg type="keyboard"` call. Never `type="text"` then `type="edit"` to attach buttons.
