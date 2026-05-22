---
name: reading-article
description: "Fresh-content reading practice. Searches authentic web material on a topic the learner cares about, generates a level-matched article, asks comprehension + logic + vocab questions, persists evidence, auto-harvests vocab. Trigger for '今日阅读', '读篇文章', 'article', '聊聊新闻', '读点什么'."
---

# Reading Article (Fresh Content & Q&A)

One round per session: pull a fresh real-world topic via `web_search`, regenerate a level-matched English article in-house, ask 3–5 mixed questions (main-idea + paragraph-function + inference + vocab-in-context), grade, auto-harvest 3–5 high-value items into the SRS, persist, then adapt the next article by i+1.

## 1. Inputs

Trigger when:

- User says: `今日阅读`, `每日文章`, `读篇文章`, `daily article`, `话题讨论`, `聊聊`, `read something`, `读点什么`.
- Callback `reading-article`.
- Planner routes here when reading subcaps are weak AND the learner has not done a fresh-content read in ≥ 24 hours.

Required context before generating:

1. `persist {"action":"recent_practice","session_id":"<session>","skill_type":"reading.article","limit":20}` (`limit` int). Returns rows + `recent_prompt_hashes`. Source of truth for §2.3 credit and §2.4 dedup; do not duplicate hashes in `metadata`.
2. `persist {"action":"coach_context","days":14,"limit":8}` for subcaps / errors / weak reading dimension and `Vocabulary Profile.cefr` (caps vocab harvest level). Slow signal — only re-call when tier changes.
3. `MEMORY.md` / `USER.md` only as fallback. No raw `study.db` access.

## 2. Difficulty Policy

Target **i+1**: one stretch above the learner's last successful read. Adapt word count, topic abstraction, syntactic density; never combine multiple stretches in one round.

### 2.0 Constants & Tier

| Constant | Value | Meaning |
| --- | --- | --- |
| `PASS_THRESHOLD` | `0.70` | A round with `accuracy ≥ PASS` is a pass. |
| `FAIL_THRESHOLD` | `0.40` | Below = fail; `[FAIL, PASS)` = "hold". |
| `STREAK` | `2` | Passes/fails needed to move tier. |
| `ACC_WINDOW` | `3` | Sample window for §2.2 mean. |
| `DEDUP_WINDOW` | `20` | Rolling `prompt_hash` window. |

`accuracy` = (correct items) / (total items). Total items = main-idea (rubric 1.00 / 0.50 / 0.00) + paragraph-function + inference + vocab-in-context (each binary 1 / 0) = **4 or 5**.

| Tier (IELTS band ≈ CEFR) | Words | Topic style | Syntax |
| --- | --- | --- | --- |
| Beginner (< 5.5 ≈ A1–B1) | 200–300 | Daily life, narrative news | Short sentences, low nominalization |
| Intermediate (5.5–6.5 ≈ B1–B2) | 350–500 | Tech / culture / argumentative news | Moderate clauses, some hedging |
| Advanced (≥ 6.5 ≈ B2+) | 500–700 | Opinion piece, academic-leaning analysis | Dense nominalization, multi-clause |

**Reading the learner's level from `MEMORY.md`**:

1. Prefer `Band Snapshot.Reading` (CEFR string). Map: `A1`/`A2` → Beginner, `B1` → Beginner, `B2`/`C1`/`C2` → Advanced.
2. Boundary suffix (`A2+`, `B1-`): **降一级起步**.
3. If CEFR missing, fall back to 14-day `reading.gist` average from `coach_context.summary.subcaps` (0–10) and the tier table.
4. **Never** read `Core Capabilities.Reading: <n>/100` as IELTS band — that's a 0–100 capability score.
5. `Vocabulary Profile.cefr` caps the harvest level (a B1 learner doesn't need C2 jargon in their SRS).

### 2.2 Recent-accuracy

Mean `accuracy` over last `ACC_WINDOW` `completed=1` rows of current `session_id` + `skill_type`. Abandoned (`completed=0`) excluded from mean but count as fail for `demotion_credit`.

Fallback chain when fewer than `ACC_WINDOW` rows: 14-day mean from `coach_context.summary` → `MEMORY.md` band − 1 tier at shortest passage → Beginner 220-word. Never guess upward.

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
| `promotion_credit ≥ STREAK` inside tier | Words **+60** (clamped to tier max); reset `promotion_credit`. |
| `demotion_credit ≥ STREAK` at tier floor | Demote tier; reset both credits; start at prev tier's longest passage. |
| `demotion_credit ≥ STREAK` inside tier | Words **−60** (clamped to tier min); reset `demotion_credit`. |
| `article_hard` tap | Persists abandoned row (State B); surfaces as fail next call. |

Retry rows (`redo_count > 0`) skipped from credit; still count for dedup.

Hold: keep word count, swap topic family to probe a different weakness.

### 2.4 Topic & Generation

1. **Source**: call `web_search` with a query combining the user's interests (`USER.md`) and a freshness modifier (`today`, `recent`, `this week`). Read 1–2 result snippets — DO NOT copy them verbatim into the article.
2. **Regenerate**: write a new English article in your own words at the chosen tier's length / syntax density. Each paragraph must have a distinct discourse function (claim / example / counter / conclusion) so paragraph-function questions are answerable.
3. **Topic family rules**:
   - Pick a topic that overlaps the user's interests when known.
   - Don't repeat the same topic family for 2+ consecutive rounds.
   - Reject any passage whose `prompt_hash` ∈ `recent_practice.recent_prompt_hashes`.
4. **Vocab seed** (silent, MANDATORY): before sending the article, scan it for 3–5 high-value items (collocations, native phrasings, academic chunks) ABOVE the learner's current CEFR by exactly one band. These items will be:
   - Tested in §3 State B (one vocab-in-context question).
   - Auto-harvested in §3 State D (the rest).

## 3. Flow

### State A: Deliver Article

1. From §2.3 + `coach_context`, decide tier, word count, topic family.
2. `web_search` for fresh material on the chosen topic (1–2 snippets is enough — you're getting the angle, not the wording).
3. Generate the passage at chosen length / topic. Compute `prompt_hash`; regenerate on dedup hit.
4. Pick the 3–5 vocab seeds (§2.4 step 4).
5. Send the article + reading instruction + buttons in **one** `tg_msg type="render"` call (`terminal: true`):

   ```json
   {
     "type": "render",
     "text": "{the full article in HTML — paragraphs separated by blank lines}\n\n📖 慢慢读完，点“答题”开始。",
     "buttons": [["🆘 看不太懂|article_help", "✅ 准备答题|article_ready", "🛑 太难了|article_hard"]],
     "terminal": true
   }
   ```

6. Init empty `ui_feedback` accumulator.
7. Wait for the user's tap.

### State B: Answering

Branch on the user's tap:

`article_help`:

- Append `🆘 看不太懂` to `ui_feedback`.
- Send a text-only scaffold via `tg_msg type="render"` (no buttons, `terminal: true`):
  - 3 hardest words with Chinese gloss.
  - 1-line structural hint: "注意第二段的转折".
- Wait for the user's next action.

`article_hard`:

1. **Persist abandoned record FIRST**:

   ```
   completed=0, accuracy=0, response="",
   feedback="Learner tapped '🛑 太难了' before answering. Treat as strong negative evidence at this tier/topic.",
   ui_feedback="🛑 太难了", load_score=0, minutes=0,
   metadata={"abandoned_reason":"too_hard","tier":"<beginner|intermediate|advanced>","words":<n>,"topic":"<topic>"}
   ```

2. **Replacement.** Apply demotion (§2.3). Brief Chinese ack, regenerate at the easier tier → State A.

`article_ready` (the main path):

Ask questions sequentially via `tg_msg type="render"` (one question per call, `terminal: true` between turns):

1. **Main-idea** (open text): `一句话说主旨（≤ 20 字）`.
2. After the main-idea reply, send 2–3 **paragraph-function** or **inference** MCQ via `render` with inline option buttons. Each callback encodes the answer: `article_q1_a`, `article_q1_b`, etc.
3. After the MCQ batch, send 1 **vocab-in-context** question: pick one of the §2.4 step-4 seeds and ask "文中“{phrase}”最接近哪个意思？" with 4 Chinese-gloss options.

### State C: Evaluate

When all answers are in:

1. Grade main-idea against this rubric (use verbatim):

   | Score | Rubric |
   | --- | --- |
   | `1.00` | Captured the main thrust + pivot precisely. |
   | `0.50` | Captured a sub-idea or one supporting fact; missed the main thrust. |
   | `0.00` | Off-topic / no answer. |

2. Grade paragraph-function / inference / vocab-in-context binary (1 / 0).
3. `accuracy = (main_idea_score + sum(quiz_correct)) / total_items`.
4. **Persist FIRST, THEN feedback**. Sequential — the row must be in DB before feedback reaches the learner.

Feedback message (Chinese, single `tg_msg type="render"`, `terminal: true`) must include:

- 1–2 sentence Chinese evaluation: how many they got, where they tripped.
- The actual main idea in ≤ 20 字 (your own canonical answer).
- A 1-line paragraph-function map.
- The harvested vocab list (3–5 items), each line: `**phrase** — Chinese gloss — 文中原句`.
- Wrap any "answer-key" inside `<tg-spoiler>` so the learner can verify without re-reading the passage.

`react` field driven by accuracy:

| accuracy | emoji |
| --- | --- |
| `1.0` | `🔥` |
| `≥ PASS_THRESHOLD` (0.70) | `👍` |
| `< PASS_THRESHOLD` | omit |

Buttons (always, regardless of accuracy):

```json
[["🔁 再来一篇|article_next", "🧭 练习其他|nav:main"]]
```

### State D: Persist Evidence + Harvest

Two writes:

1. `persist action="practice"` (or omit `action`). Minimum payload:

   ```json
   {
     "skill_type": "reading.article",
     "session_id": "<session>",
     "prompt": "<the full article text>",
     "prompt_hash": "<sha1(normalized prompt) first 16 chars>",
     "response": "<the user's answers, structured: 'gist=讲气候政策的折衷; q1=B; q2=C; q3=A; vocab=B'>",
     "accuracy": 0.80,
     "raw_score": 4,
     "max_score": 5,
     "feedback": "<IN ENGLISH for DB / learner-state> Got the main idea + 3 of 4 MCQs; missed the inference on paragraph 3 where the author hedges with 'arguably'. Vocab pick was correct.",
     "section": "reading",
     "domain": "reading",
     "load_score": 2,
     "minutes": 4,
     "mode": "study",
     "ui_feedback": "<comma-joined exact button labels tapped this round, empty if none>",
     "metadata": "{\"tier\":\"intermediate\",\"words\":420,\"topic\":\"ai_policy\",\"topic_family\":\"tech\",\"promotion_credit_after\":1,\"demotion_credit_after\":0}",
     "errors": "[{\"key\":\"inference_hedge_miss\",\"category\":\"reading\",\"severity\":\"medium\",\"original\":\"\",\"correction\":\"\",\"note\":\"Treated a hedged opinion ('arguably') as an assertion.\"}]",
     "subcap_scores": "[{\"key\":\"reading.gist\",\"score\":8.0,\"evidence\":\"Main idea captured precisely.\"},{\"key\":\"reading.inference\",\"score\":6.5,\"evidence\":\"Missed hedge in paragraph 3.\"},{\"key\":\"reading.vocab_in_context\",\"score\":8.0,\"evidence\":\"Picked the right gloss for an above-CEFR collocation.\"}]"
   }
   ```

   `prompt_hash` = first 16 hex chars of `SHA-1(normalized prompt)`; normalize = lowercase + strip punctuation + collapse whitespace.

2. `persist action="word_upsert"` for each §2.4-step-4 vocab seed not already in the DB (use `persist action="word_lookup"` first if uncertain):

   ```json
   {
     "action": "word_upsert",
     "word": "<phrase>",
     "item_kind": "<word|chunk|pattern>",
     "definition": "<English gloss>",
     "chinese": "<Chinese gloss>",
     "example_en": "<EXACT sentence from the article>",
     "topics": "<topic_family>",
     "mastery": "queued_new",
     "origin": "reading-article"
   }
   ```

State D persists fully-attempted passages only. Abandoned rows are written in State B.

### State E: Continue (`article_next`)

- Re-call `persist action="recent_practice"` (§1) for credits + dedup.
- Apply §2.3 (skip `redo_count > 0`) before generating.
- **NEVER re-call `coach_context` within the same skill session.** It is cached server-side (5-min TTL) and expensive.
- Generate next article (State A — incl. fresh `web_search` + dedup). Respect "no same topic family twice in a row" (§2.4).

## 4. Failure And Fallbacks

- `web_search` returns nothing usable → fall back to a generic topic (climate / tech / culture) at the chosen tier; record `metadata.search_fallback: true`.
- User answers before reading (extremely short main-idea reply that doesn't match the passage) → grade normally; the rubric will catch it.
- User submits Chinese for the main-idea question → grade by meaning, not language.
- `persist` fails → still send feedback, but say it was not saved.
- `<tg-spoiler>` is client-side; no callback. Don't invent `spoiler_used`.

## 5. Hard Rules

1. **One article per round.** No "here's another one for comparison" — i+1 is single-axis.
2. **Article goes out in ONE render call.** Article body + reading instruction + buttons in a single `tg_msg type="render"` with `terminal: true`. No separate type="text" then type="keyboard" sequence.
3. **Every user-visible step uses `tg_msg type="render"` with `terminal: true`.** Question delivery, scaffolding, feedback — each one is a single render envelope.
4. **Reactions belong inside the render envelope's `react` field.** Do not call `tg_msg type="react"` separately.
5. **4 or 5 items per round.** Main-idea + (2–3 MCQ) + vocab-in-context.
6. **Trap-style options are plausible.** Wrong MCQ options should literally keyword-match the passage but mean the wrong thing.
7. **MCQ via render buttons.** Quiz questions MUST use `tg_msg type="render"` with inline option buttons. Do NOT use Telegram quiz/poll.
8. **Vocab harvest is silent.** No "I've added 5 words to your flashcards" announcement — they show up in `vocab-review` naturally.
9. Use `persist` for reads/writes; no raw DB.
10. Don't update `MEMORY.md`; `learner-state` owns durable ability state.
