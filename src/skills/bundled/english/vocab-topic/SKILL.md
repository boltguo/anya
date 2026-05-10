---
name: vocab-topic
description: "Topic-cluster vocabulary learning: 8–12 items on one topic — present grouped by kind, study window, hide, then mixed recall. Trigger for '话题词汇', '教育话题', '环境词汇', '成组学'."
---

# Vocab Topic

Topic-tight cluster drill. Pick a topic, present 8–12 items grouped by kind (concepts / collocations / hedging), give a study window, hide, then 5 mixed-format recall prompts. Each recalled / missed item triggers a per-word `word_review`. Promotion is owned by the SRS algorithm — this skill does not run §2-style credit gating.

## 1. Inputs

Trigger when:

- User says: `话题词汇`, `教育话题`, `环境词汇`, `topic vocab`, `成组学`, `背一组关于X的词`.
- Callback `vocab-topic` (auto-pick topic) or `vocab-topic:<topic>` (force a specific topic).
- Planner routes here when an upcoming `writing-essay` topic is known and the user lacks the lexical bank to write it.

Required context before generating:

1. **Pick `topic` first** (learner explicit, callback suffix, or auto from weakest coverage / upcoming writing prompt). Then call `persist {"action":"recent_practice","session_id":"<session>","skill_type":"vocab","limit":20,"metadata_filter":{"topic":"<topic>"}}` for prior-session topic coverage; if filter unsupported, fetch generic `recent_practice` and filter in-code.
2. `persist {"action":"due_words","limit":40,"filter":{"topic_tag":"<topic>"}}` — pull existing words tagged for this topic. If the bank for this topic is thin (< 10 items), generate the missing ones and seed via `persist action="word_upsert"` with `origin="vocab-topic-seed"`, `topic_tag="<topic>"`.
3. `persist {"action":"coach_context","days":14,"limit":8}` for `Vocabulary Profile.cefr` (caps register / item difficulty) and weakest writing/speaking subcaps (informs which topic to recommend if the user said "你看着安排").
4. `MEMORY.md` / `USER.md` only as fallback.

## 2. Topic Selection & Bundle Sizing

This skill does NOT run §2.3-style PASS / FAIL / STREAK credit gating. Promotion is owned by `persist action="word_review"`, which updates per-word `ease`, `interval`, `srs_due`, `mastery`, and `word_reviews`.

### 2.0 Topic catalog

| Topic | Typical sub-themes |
| --- | --- |
| education | curriculum, assessment, rote vs critical, lifelong learning |
| technology | automation, privacy, AI, tech adoption |
| environment | emissions, biodiversity, policy, transition |
| health | mental health, nutrition, public health, aging |
| work | remote work, work-life balance, automation, gig economy |
| society | inequality, urbanization, family structure, migration |
| culture | media consumption, traditions, language, identity |
| government | regulation, taxation, civil liberties, public services |

For non-listed topics aligned with `USER.md` interests (e.g. `MOBA games`, `films`, `interview prep`), generate the bundle ad-hoc with `topic_tag="<topic>"`.

### 2.1 Bundle composition

Each bundle MUST contain all three kinds:

| Kind | Count | Purpose |
| --- | --- | --- |
| Concept | 4–5 | Core nouns / verbs that name the topic's central ideas. |
| Collocation / chunk | 3–4 | Multi-word units used in real discourse on this topic. |
| Hedging / framing | 2–3 | Discourse moves (e.g. `It is widely argued that`, `to a certain extent`, `albeit at the cost of`). |

Total: **8–12 items**. Below 8 = bundle too thin (auto-seed). Above 12 = lose the user.

### 2.2 Auto-seeding

If `due_words` for the topic returns < 10 items, generate the missing ones to bring the total to 10–12, and `persist action="word_upsert"` each one with `origin="vocab-topic-seed"`, `topic_tag="<topic>"`, `mastery="queued_new"`, `is_user_word=0`. Include CN gloss + IPA + a topic-grounded example sentence.

### 2.3 Rating mapping

After the recall round (§3 State C), per item:

- Recalled correctly → `rating=4`.
- Recalled with hesitation / partial → `rating=3`.
- Missed entirely → `rating=1`.

Persist via `persist action="word_review"` once per recalled/missed item.

## 3. Flow

### State A: Prepare And Present

1. Pick topic; call `due_words` + auto-seed if needed.
2. Compose the bundle (4–5 concepts + 3–4 chunks + 2–3 hedging).
3. Compute `prompt_hash` over `topic + sorted item list` so a same-topic-same-bundle replay is dedup'd.
4. Send a `tg_msg type="text"` containing the bundle, **grouped by kind**:

   ```text
   📚 主题：**{topic}** （{n} 个）

   **核心概念**
   - {word1} /{IPA1}/ — {CN gloss} · 例：{1-line topic-grounded example}
   - {word2} ...

   **搭配 / 短语**
   - {chunk1} — {CN gloss} · 例：...
   - {chunk2} ...

   **框架表达**
   - {hedge1} — {CN gloss} · 例：...
   ```

5. Optional: a `tts` audio bundle reading word + gloss + example for each item (skip if > 12 items or if user has audio fatigue from earlier in the session).
6. Start the countdown timer via `tg_msg type="countdown"`:

   ```json
   {
     "type": "countdown",
     "text": "⏱️ 学习时间：<b>{seconds}</b> 秒",
     "seconds": 90,
     "expire_text": "📖 时间到！开始测试 →",
     "tag": "timer"
   }
   ```

7. Send a separate `tg_msg type="keyboard"`:

   Text:

   ```text
   ⏱️ 90 秒学习时间，到时自动开始测试。
   ```

   Buttons:

   ```json
   [["🛑 太多了换一组|vt_easier"]]
   ```

8. Init empty `ui_feedback` accumulator.

### State B: Start Recall (after timer or user message)

When the user sends any message (or the timer expires and the user responds):

- Append the event to `ui_feedback`.
- Edit the bundle message to hide it: `tg_msg type="edit" message_id=<bundle_msg_id> text="📖 已隐藏 — 开始测"`. If edit fails, send a long separator block.
- Proceed directly to State C.

`vt_easier`:

1. **Persist abandoned record FIRST**:

   ```
   completed=0, accuracy=0, response="",
   feedback="Learner tapped '🛑 太多了换一组' before recall. Treat as negative evidence at this topic / bundle size.",
   ui_feedback="🛑 太多了换一组", load_score=0, minutes=0,
   metadata={"abandoned_reason":"too_many","topic":"<topic>","bundle_size":<n>}
   ```

   After `persist` returns, reset `ui_feedback`.

2. **Replacement.** Pick a different (less abstract) topic OR shrink bundle to 8 items, brief Chinese ack, regenerate → State A.

### State C: Recall Round

After the bundle is hidden, run **5 mixed recall prompts** (no format dominates — mirror the catalog from `vocab-testme` §2.4 but stay shorter). Cycle through:

| Format | UI | Item count |
| --- | --- | --- |
| CN → EN | `keyboard` with text prompt (user types answer) | 1–2 |
| Meaning → chunk (gist clue → chunk) | `keyboard` 4 option buttons, 1 fits | 1 |
| Fill-in-blank (sentence with the topic word missing) | `keyboard` with text prompt (user types answer) | 1 |
| Register pick (formal vs informal alternative for a hedge) | `keyboard` 2–4 option buttons | 1 |
| Production sentence (write 1 sentence on the topic using ≥ 2 items) | `keyboard` with text prompt | 1 |

Do NOT use `tg_msg type="quiz"`. All MC formats use `tg_msg type="keyboard"` with inline option buttons (callbacks like `vt_q1_a`, `vt_q1_b`, etc.). Text-input formats use `tg_msg type="keyboard"` with the prompt and no option buttons — the user types directly.

Cover **at least one item from each kind** (concept / chunk / hedging). Don't test items the user already has at `mastery='mastered'` even if they were in the display bundle.

Per item:

1. Send the question.
2. When user answers, mark correct / shaky / missed and persist `word_review` immediately (rating 4 / 3 / 1).
3. Send a 1-line note: `✅ correct` / `⚠️ shaky → polished` / `❌ correct was {x}`.

After all 5 prompts:

1. Summarize: `recall {x}/5 · missed: {list}`.
2. **Persist FIRST, THEN reveal**. Sequential.
3. Reveal the bundle again as a fresh `tg_msg type="text"`, with each item that was missed wrapped in `<tg-spoiler>` so the user can self-test on review.

### State D: Persist Evidence (batch close)

Call `persist action="practice"` once for the topic session.

Minimum payload:

```json
{
  "skill_type": "vocab",
  "session_id": "<session>",
  "prompt": "<topic>",
  "prompt_hash": "<sha1('vocab-topic:' + topic + ':' + sorted comma-joined items)>",
  "response": "<recall results, e.g. 'cn2en:resilient=pass, gist:elaborate=fail, fill:fluctuate=shaky, register:to_some_extent=pass, prod:used 2 items naturally'>",
  "accuracy": 0.60,
  "raw_score": 3,
  "max_score": 5,
  "feedback": "<IN ENGLISH for DB / learner-state> Concepts solid (resilient, fluctuate). Chunks weaker — 'elaborate on' confused with 'elaborate about'. Hedging picked up well. Production sentence used 2 items naturally; would have been higher with 3+.",
  "section": "vocab",
  "domain": "vocab",
  "load_score": 1,
  "minutes": 5,
  "mode": "study",
  "ui_feedback": "<comma-joined exact button labels tapped this session, e.g. '✅ 我看完了' — empty if none>",
  "metadata": "{\"topic\":\"education\",\"bundle_size\":10,\"kinds_covered\":[\"concept\",\"chunk\",\"hedging\"],\"recall_count\":5,\"seeded_count\":3,\"weakest_kind\":\"chunk\"}",
  "errors": "[{\"key\":\"collocation_error\",\"category\":\"vocab\",\"severity\":\"medium\",\"original\":\"elaborate about\",\"correction\":\"elaborate on\",\"note\":\"'elaborate' takes 'on'.\"}]",
  "subcap_scores": "[{\"key\":\"vocab.recall\",\"score\":6.0,\"evidence\":\"3 of 5 recall items correct.\"},{\"key\":\"vocab.production\",\"score\":6.0,\"evidence\":\"Used 2 of 10 bundle items in a single sentence; natural register.\"}]"
}
```

`metadata.topic` is **mandatory** so future `recent_practice` filters work.

`raw_score` = recall items rated 3 or 4. `max_score` = recall items in the round (not bundle size — only what was tested). `accuracy = raw_score / max_score`.

Per-item `word_review` calls were already made in State C; do NOT re-submit them in State D's payload.

### State E: Continue (`vocab-topic` or `vocab-topic:<topic>`)

- Re-call `due_words` for whichever topic is next (callback can force a specific one; otherwise rotate by weakest coverage).
- **NEVER re-call `coach_context` within the same skill session.** It is cached server-side (5-min TTL). Only `due_words` needs re-reading for the next batch.

End-of-batch buttons:

```json
[["🔄 换个主题|vocab-topic", "🧭 练习其他|nav:main"]]
```

**Critical**: send the recall summary + buttons in **one** `tg_msg type="keyboard"` call. The bundle reveal `tg_msg type="text"` with `<tg-spoiler>` for missed items is a separate message before.

## 4. Collaborates With

- `planner`: routes here ahead of a writing-essay prompt to seed the lexical bank.
- `learner-state`: reads `samples` rows + per-word `word_reviews`; updates `MEMORY.md` `Vocabulary Profile.topic_coverage`.
- `planner`: (proactive nudge) uses topic coverage to recommend rotation (don't keep drilling 'education' if `environment` is at 0% coverage and exams are coming).
- `vocab-testme`: hand-off after every topic session — verify recall under varied formats.
- `vocab-review`: companion for due-flow (vocab-topic seeds new items into the queue).
- `writing-essay` / `speaking-roleplay`: downstream consumers — once the bundle lands in mastery, prompts on that topic become accessible.
- `support/data-contract`: defines the `persist` write protocol.

## 5. Failure And Fallbacks

- Auto-seed adds < 10 items because LLM generation runs out of high-quality candidates → run with whatever was seeded (≥ 6 minimum); record `metadata.bundle_size` honestly.
- `tg_msg type="edit"` (hide step) fails → send the long separator block instead. The bundle message remains visible but pushed off-screen.
- User submits the production sentence using only 1 item (instead of 2+) → grade as shaky (`rating=3` for the item used, no review for items not used).
- User answers all in Chinese → ask once; if persistent, count text-input items as `rating=1` and proceed to next.
- `persist action="word_review"` fails on one item → still send the 1-line note, mention "未保存"; continue.
- Recall round interrupted → State D not written. Per-item `word_reviews` from State C are saved.

## 6. Hard Rules

1. **One topic per session.** No mixed-topic bundles. Each row's `metadata.topic` is single-valued.
2. **8–12 items sweet spot.** Below 8 = auto-seed; above 12 = trim. Don't drift.
3. **All 3 kinds present.** Concept + chunk + hedging — every bundle. Recall round must touch at least one item from each kind.
4. **Hide before recall.** The bundle message is hidden (or pushed off-screen) before any recall prompt is sent.
5. **Audio bundle is optional.** Don't force TTS if the user is in audio fatigue or the bundle is > 12 items.
6. **Auto-seed thin topics** with `origin="vocab-topic-seed"` so future sessions can find them.
7. **Persist `metadata.topic`** so `recent_practice` filters work next round.
8. Use `persist` for reads/writes; no raw DB.
9. Don't update `MEMORY.md`; `learner-state` owns durable vocab state.
10. **One-call keyboard** for the recall summary. Never `type="text"` then `type="edit"` to attach buttons.
