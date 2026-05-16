---
name: vocab-review
description: "MUST trigger when the user asks to review vocabulary, check their memory, study words, or do flashcards. This manages the core Spaced Repetition System (SRS) — pulls due items, runs an active-recall flashcard, then a micro-lesson on reveal."
---

# Vocabulary Review (SRS & Micro-lessons)

SRS-driven flashcard drill. Pull due items, run active recall on each (audio + hidden meaning), grade by user self-report (秒懂 / 模糊 / 忘了), reveal a fixed-layout micro-lesson, persist per-word reviews + a batch sample row, then loop or end. Promotion is handled by the persist tool's SRS algorithm — this skill does not run §2-style credit gating.

## 1. Inputs

Trigger when:

- User says: `背单词`, `review words`, `flashcards`, `考考我昨天的词`, `复习生词`.
- Callback `vocab-review`.
- Planner routes here when SRS due-count is high or `Vocabulary Profile.due_count` is the dominant signal.

Required context before generating:

1. `persist {"action":"due_words","limit":8}` — pulls due SRS items in `srs_due` order. The list is the source of truth for the batch.
2. `persist {"action":"coach_context","days":14,"limit":8}` for `Vocabulary Profile.cefr` (caps which words the LLM can mint on the fly when seeding examples) and `coach_context.summary.subcaps.vocab.recall` (informs whether to include extra production hints).
3. `MEMORY.md` / `USER.md` only as fallback. No raw `study.db` access.

If `due_words` returns 0 items, **do not invent**. Send via one `tg_msg type="render"` (no `url`): `text="📚 现在没有到期单词。要不要 vocab-topic 学一组新的？"` + `buttons=[["📚 学一组新词|vocab-topic", "🧭 练习其他|nav:main"]]` and stop.

## 2. SRS Promotion

This skill does NOT run §2.3-style PASS / FAIL / STREAK credit gating. Promotion is owned by the `persist action="word_review"` algorithm, which updates per-word `ease`, `interval`, `srs_due`, `mastery`, and `word_reviews` based on the per-card `rating` you submit (`5` = Easy, `3` = Hard, `1` = Again).

What this skill controls:

- **Batch size**: 5–8 words per session (use the `due_words` `limit` parameter; default 8).
- **Re-test rule**: any word rated `1` (Again) **must** appear again before the batch ends — append it to the queue.
- **Rating mapping** (mandatory):
  - `[🎯 秒懂 (Easy)]` → `rating=5`.
  - `[🤔 模糊 (Hard)]` → `rating=3`.
  - `[❌ 忘了 (Again)]` → `rating=1`.
- **Mastery query**: never override the SRS algorithm's `mastery` field manually. Read it for display only.

The batch-level `accuracy` written in State D is informational (used for `samples` row + activity rollup), not a gating signal.

## 3. Flow

Two-turn state machine, looped for each word in the batch.

### State A: Active Recall (the flashcard)

For the current word, present a flashcard test. Hidden meaning until the user taps a memory button.

1. Pre-step: confirm the word came from this batch's `due_words` list (don't run State A on a word that wasn't fetched).
2. **Audio (mandatory)**: TTS the word using SSML `<break>` tags for the segmented breakdown:

   ```
   apple. apple. apple. ap <break time="500ms"/> ple. I ate an apple.
   ```

   Format: word ×3 (normal speed) → word with one mid-syllable break ×1 → example sentence ×1.

3. **Send card via one `tg_msg type="render"` call** (voice + card text + rating buttons in one envelope):

   ```json
   {
     "type": "render",
     "url": "<tts audio path>",
     "text": "{word} /{IPA}/\n\n{fill-in-the-blank example sentence using the word, OR a clever yes/no question that forces recall}\n\n先想 5 秒再点 ↓",
     "buttons": "[[\"👍 认识|srs:easy:{word}\", \"🤔 模糊|srs:hard:{word}\"], [\"❌ 不认识|srs:again:{word}\"]]"
   }
   ```

4. **Stop and wait.** Do NOT generate the micro-lesson. Wait for callback.

### State B: Handle Feedback (and reveal)

When the callback arrives (`srs:easy:<word>` / `srs:hard:<word>` / `srs:again:<word>`):

**⚡ CALLBACK BUDGET (normal path): 2 tool calls** — `persist word_review` + `tg_msg edit`. Do NOT call `persist coach_context`, `persist recent_practice`, or `skill_view`. The batch data is already in context from State A. **Exception**: if `word_review` fails with "word not found", an extra `word_upsert` + retry `word_review` is allowed (max 4 calls in this rare case).

1. **Persist SRS feedback FIRST** via `persist action="word_review"` with the mapped `rating` (see §2). The tool updates `ease`, `interval`, `srs_due`, `mastery`, and appends to `word_reviews`. Do this BEFORE rendering the micro-lesson — if the call fails with "word not found", call `persist action="word_upsert"` to create the word entry first, then retry `word_review`.

2. **If `rating=1` (Again)**: append this word to the end of the current batch's queue. The user must see it again before the batch ends.

3. **Reveal micro-lesson by EDITING the original card message** — do NOT send a new message. Use `tg_msg type="edit" message_id=<card_msg_id>` to replace the card text with the full reveal:

   ```text
   {original card text}
   ——————
   📖 **释义**: {concise Chinese meaning, ≤ 12 字}
   🔪 **拆解**: {prefix(meaning) + root(meaning) + suffix(meaning) — only if morphology is informative; omit the line otherwise}
   🗣️ **地道平替**: {1 native-feel slang/idiom alternative — e.g. instead of 'exhausted' say 'wiped out'}
   📝 **高频搭配**: {1–2 collocations in the form '{verb/adj} + {word}' or '{word} + {prep/noun}'}
   ```

   This appends the reveal IN PLACE on the same message, avoiding a separate message that clutters the chat.

   **Reveal data sources**: Use the word's existing DB fields (`chinese`, `definition`, `collocations`, `ipa`) from the `due_words` result already in context. Only fall back to LLM-generated content if the DB fields are empty.

4. **Proceed**: if more words remain in the batch (including any `Again` re-tests), loop back to State A with the next word. If all done, go to State D for the batch sample row, then State E.

### State C (skipped — covered by State B)

This skill folds State C into State B (the rating *is* the evaluation; the reveal is the feedback). State C is intentionally left as a header to keep the skeleton aligned with other skills.

### State D: Persist Evidence (batch close)

After the entire batch is finished (every original word scored, plus any `Again` re-tests resolved), call `persist action="practice"` once for the whole batch.

Minimum payload:

```json
{
  "skill_type": "vocab",
  "session_id": "<session>",
  "prompt": "review-batch",
  "prompt_hash": "<sha1('review-batch:' + sorted comma-joined words)>",
  "response": "<comma-joined per-word results, e.g. 'resilient:easy, fluctuate:hard, elaborate:again, elaborate:hard'>",
  "accuracy": 0.71,
  "raw_score": 5,
  "max_score": 7,
  "feedback": "<IN ENGLISH for DB / learner-state> 5 of 7 retests landed easy or hard. 'elaborate' needed two passes. 'fluctuate' shaky on collocation. Suggest seeing 'fluctuate' inside a chart-description prompt next.",
  "section": "vocab",
  "domain": "vocab",
  "load_score": 2,
  "minutes": 4,
  "mode": "study",
  "ui_feedback": "<comma-joined exact button labels tapped this batch, capturing per-word ratings — e.g. '🎯 秒懂 (Easy),🤔 模糊 (Hard),❌ 忘了 (Again),🤔 模糊 (Hard)'>",
  "metadata": "{\"batch_size\":7,\"easy_count\":2,\"hard_count\":3,\"again_count\":1,\"retest_count\":1,\"weakest_word\":\"elaborate\"}",
  "subcap_scores": "[{\"key\":\"vocab.recall\",\"score\":6.0,\"evidence\":\"5 of 7 retests successful; one word required a second pass.\"}]"
}
```

`raw_score` = count of words rated Easy or Hard on their **last** appearance (Again-then-Easy counts as 1). `max_score` = number of unique words in the original batch (NOT including re-test counts, otherwise the denominator inflates). `accuracy` = `raw_score / max_score`.

Per-word `word_review` calls were already made in State B; do NOT re-submit them in State D's payload.

### State E: Continue (`vocab-review`)

- Re-call `persist action="due_words"` to fetch the next batch (the algorithm will return whatever is now due; recently-rated words are pushed forward).
- Skip `coach_context` re-call unless `Vocabulary Profile.cefr` changed.
- If 0 items, fall back to the empty-due message in §1.

End-of-batch buttons (after State D persist returns):

```json
[["🔄 再背一组|vocab-review", "🧭 练习其他|nav:main"]]
```

**Critical**: send the batch summary + buttons in **one** `tg_msg type="render"` call (no `url`). On a perfect batch (`accuracy === 1.0`) add `react: "🔥"` to the same call.

## 4. Collaborates With

- `planner`: routes here when SRS due-count is the strongest signal.
- `learner-state`: reads `samples` rows; updates `MEMORY.md` `Vocabulary Profile`.
- `planner`: (proactive nudge) uses `vocab.recall` subcap to recommend rebalancing (more reading-deepdive harvests, less new vocab-topic, etc.).
- `vocab-harvest`: feeds new items into the queue (`origin="practice_harvest"`) — vocab-review pulls them in due order.
- `vocab-topic` / `vocab-testme`: alternative routes when due-count is low.
- `support/data-contract`: defines the `persist` write protocol.

## 5. Failure And Fallbacks

- TTS fails → send the card text without audio; flag `metadata.tts_failed=true`. Do NOT swallow the failure silently.
- `persist action="word_review"` fails on a card → still reveal the micro-lesson (the lesson is value even if SRS state didn't move) but tell the user "未保存，下次还会来"; do NOT proceed to the next card until the user acknowledges.
- User answers in plain text instead of tapping a button → ask once: "点一下按钮告诉我你记得的程度好吗？" If they reply with the literal word "easy" / "hard" / "again", accept it and persist with the corresponding rating.
- Batch interrupted mid-way → State D is **not** written. Each per-word `word_review` is already saved (State B). The next session's `due_words` will reflect whatever was rated.
- `<tg-spoiler>` is client-side; no callback. Don't use `<tg-spoiler>` for the reveal — the reveal must be a server-rendered separate message (the user already committed by tapping a button).

## 6. Hard Rules

1. **No info dumping.** The micro-lesson uses the 5-line fixed layout — no paragraphs, no extra context. Brevity is the lesson format.
2. **Active recall first.** NEVER reveal the meaning before the user taps a memory button. The effort of trying is what builds the trace.
3. **Audio mandatory.** Every flashcard sends a TTS voice with the SSML break pattern. No silent flashcards.
4. **Re-test all `Again` words.** A word rated `1` MUST appear again before the batch ends. Otherwise the SRS schedule lies.
5. **Word_review per card, not per batch.** Persist each rating in State B as it happens — do NOT batch them into State D's payload.
6. **Don't override `mastery`.** The persist algorithm owns it. Read for display, never write directly from this skill.
7. Use `persist` for reads/writes; no raw DB.
8. Don't update `MEMORY.md`; `learner-state` owns durable vocab state.
9. **Edit card for reveal.** Use `tg_msg type="edit"` to append the micro-lesson to the existing card message. Do NOT send the reveal as a separate new message. (`edit` is the one exception to the "all sends go through render" rule — render can't mutate an existing message.)
10. **Batch sample mandatory.** State D MUST write a `persist action="practice"` row for every completed batch. Without it, learner-state underestimates vocab-review volume.
11. **Handle word-not-found.** If `word_review` returns "word not found", call `word_upsert` to create the word first, then retry. Never silently skip.
12. **Callback = 2 tools (normal path).** SRS callback (`srs:*`): `persist word_review` + `tg_msg edit`. No context re-reads, no coach_context, no recent_practice. Word-not-found exception may use `word_upsert` + retry, max 4 calls.
13. **Skip coach_context on continue.** When generating the next card (State A within the same batch), do NOT re-read `coach_context` or `recent_practice`. The data from the first load is still valid.
14. **All non-edit Telegram sends go through `tg_msg type="render"`.** Card delivery, batch summary, empty-due notice all use render. Only `edit` (Hard Rule 9) stays separate. Never use stand-alone `voice` / `keyboard` / `text` / `react` calls.
