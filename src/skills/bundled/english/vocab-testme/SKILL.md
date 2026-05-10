---
name: vocab-testme
description: "Active recall quiz on the learner's edge-of-knowledge items. Mixed-format batch: recall, production, collocation, spot-wrong, register, paraphrase. Triggers for '考考我', 'test me', '考考我最近学的'."
---

# Vocab TestMe

Mixed-format active-recall battery. Pull edge-of-knowledge items (`mastery != 'mastered'`), generate 6–8 questions cycling through 5 quiz formats (no format dominates), grade per-question, persist per-word `word_review` immediately + a batch sample row at the end. Promotion is owned by the SRS algorithm — this skill does not run §2-style credit gating.

## 1. Inputs

Trigger when:

- User says: `考考我`, `test me`, `考考我最近学的`, `quiz me`, `测一下`.
- Callback `vocab-testme`.
- Auto-suggested at the end of `vocab-topic` or `vocab-contextual` to verify just-learned items.

Required context before generating:

1. `persist {"action":"due_words","limit":8}` — pull 6–8 items, prefer those with `mastery` in `{queued_new, weak, shaky}` (i.e., NOT `mastered`). Items are the source of truth for the batch.
2. `persist {"action":"coach_context","days":14,"limit":8}` for `Vocabulary Profile.cefr` (caps register / gloss complexity) and recent error keys (e.g. `collocation_error` → bias toward collocation-pick + spot-wrong formats).
3. `MEMORY.md` / `USER.md` only as fallback. No raw `study.db` access.

If `due_words` returns < 4 items, fall back to: `📚 现在没几个到期单词。要不要先 vocab-topic 学一组？` with `[["📚 学一组新词|vocab-topic", "🧭 练习其他|nav:main"]]` and stop.

## 2. SRS Promotion

This skill does NOT run §2.3-style PASS / FAIL / STREAK credit gating. Promotion is owned by `persist action="word_review"`, which updates per-word `ease`, `interval`, `srs_due`, `mastery`, and `word_reviews`.

What this skill controls:

- **Batch size**: 6–8 questions, one per word (do NOT test the same word twice in one batch).
- **Format cycle**: rotate through 5 formats so no single format covers more than 2 items per batch (see §2.4 for format catalog).
- **Rating mapping** (mandatory):
  - Quiz (multiple-choice) correct → `rating=4`.
  - Quiz wrong → `rating=1`.
  - Production correct + natural → `rating=4`.
  - Production correct but awkward → `rating=3`.
  - Production wrong / unused → `rating=1`.
- **Cap at 8 items** even if `due_words` returns more — quiz batches above 8 lose the user.

The batch-level `accuracy` written in State D is informational, not a gating signal.

### 2.4 Format catalog

Cycle through these 5 formats; aim for at least 4 distinct formats per batch of 6–8:

| Format | UI | What it tests |
| --- | --- | --- |
| Recall meaning | `keyboard` 4 Chinese option buttons | Receptive recall (EN word → CN meaning) |
| Produce sentence | `keyboard` with text prompt | Productive use in context |
| Pick collocation | `keyboard` 4 collocation buttons, 1 correct | Knowledge of natural pairing |
| Spot wrong usage | `keyboard` 4 sentence buttons, 1 wrong | Discriminative usage |
| Register pick | `keyboard` 4 word buttons, 1 fits the frame | Register awareness |
| Paraphrase map | `keyboard` 4 phrase buttons, 1 paraphrases target | Synonym/paraphrase mapping |

Bias by error key:

- recent `collocation_error` → +1 collocation or spot-wrong item.
- recent `register_mismatch` → +1 register pick.
- recent `paraphrase_miss` → +1 paraphrase map.
- recent productive weakness (low `vocab.production` subcap) → +1 produce-sentence item.

## 3. Flow

Per-question state machine, looped through the batch.

### State A: Generate Mixed Quiz

For the current word in the batch:

1. Pick a format (cycle, biased per §2.4).
2. Generate the question. For `keyboard` MC formats, ensure exactly 1 correct option and 3 plausible distractors. For production formats, give the user a short topic frame ("写一句你今天工作里能用到 `<word>` 的话").
3. Send via `tg_msg type="keyboard"` with one button per option (e.g. `[["A. xxx|tm_q1_a"], ["B. xxx|tm_q1_b"], ["C. xxx|tm_q1_c"], ["D. xxx|tm_q1_d"]]`). For production format, send `tg_msg type="keyboard"` with the prompt text and no option buttons — the user types their answer directly. Do NOT use `tg_msg type="quiz"`.
4. Record `question_format`, `question_index`, `target_word`, and the canonical correct answer in working state.

### State B: Per-question Grading

When the user's answer arrives:

**⚡ CALLBACK BUDGET: max 2 tool calls per question** — `persist word_review` + `tg_msg` (1-line note + next question). Do NOT call `persist coach_context`, `persist recent_practice`, or `persist due_words` between questions. The batch data is already in context.

1. **Quiz formats**: compare the chosen option to the canonical answer. Correct → `rating=4`; wrong → `rating=1`.
2. **Production format**: evaluate naturalness:
   - Pass + natural → `rating=4`.
   - Used the word but awkward / wrong collocation → `rating=3`.
   - Didn't use the word, or used it wrongly → `rating=1`.
3. **Persist `word_review` immediately** via `persist action="word_review"` with `word=<target_word>`, `rating=<mapped>`. Do this before generating the next question — if the call fails, surface that to the user.
4. Send a **1-line note** for this question (no paragraphs):
   - Quiz correct: `✅ {correct option short}` + 1-line "why" if instructive.
   - Quiz wrong: `❌ 正确是 {correct option}` + 1-line trap explanation (e.g. "B 是同义但场景不对").
   - Production: `✅/⚠️/❌ {your inline rewrite if shaky/wrong}` + 1-line rule named.
5. Loop back to State A for the next word, or proceed to State D if batch complete.

### State C (skipped — covered by State B)

This skill folds State C into State B (per-question grading IS the evaluation). State C is intentionally left as a header to keep the skeleton aligned.

### State D: Persist Evidence (batch close)

After every word in the batch has been graded once, call `persist action="practice"` for the whole batch.

Minimum payload:

```json
{
  "skill_type": "vocab",
  "session_id": "<session>",
  "prompt": "testme-batch",
  "prompt_hash": "<sha1('testme-batch:' + sorted comma-joined words + ':' + sorted formats)>",
  "response": "<per-question results, e.g. 'Q1 recall:resilient=pass, Q2 produce:fluctuate=shaky, Q3 collocation:elaborate=fail, Q4 spot-wrong:vital=pass, Q5 register:opt=pass, Q6 paraphrase:abstain=fail'>",
  "accuracy": 0.67,
  "raw_score": 4,
  "max_score": 6,
  "feedback": "<IN ENGLISH for DB / learner-state> Recall + register stable. Production shaky on 'fluctuate' (used as adjective 'fluctuating prices' instead of verb). Collocation miss on 'elaborate' — wrote 'elaborate about' instead of 'elaborate on'. Paraphrase miss on 'abstain' suggests CN→EN binding, not paraphrase.",
  "section": "vocab",
  "domain": "vocab",
  "load_score": 2,
  "minutes": 5,
  "mode": "study",
  "ui_feedback": "<comma-joined per-question result emoji or callback labels — keep concise; this isn't button taps but answer choices, e.g. 'Q1:✅,Q2:⚠️,Q3:❌,Q4:✅,Q5:✅,Q6:❌'>",
  "metadata": "{\"batch_size\":6,\"formats_used\":[\"recall\",\"produce\",\"collocation\",\"spot_wrong\",\"register\",\"paraphrase\"],\"weakest_format\":\"collocation\",\"weakest_word\":\"elaborate\",\"production_count\":1}",
  "errors": "[{\"key\":\"collocation_error\",\"category\":\"vocab\",\"severity\":\"medium\",\"original\":\"elaborate about\",\"correction\":\"elaborate on\",\"note\":\"'elaborate' takes 'on', not 'about'. High-frequency miss for B1 learners.\"}]",
  "subcap_scores": "[{\"key\":\"vocab.recall\",\"score\":7.0,\"evidence\":\"3 of 4 multiple-choice items correct.\"},{\"key\":\"vocab.production\",\"score\":5.5,\"evidence\":\"Single production item — used the word but with wrong word-class.\"}]"
}
```

`raw_score` = count of questions rated 3 or 4 (counting shaky-production as half is not allowed — the rating drives the count). `max_score` = number of questions in the batch. `accuracy = raw_score / max_score`.

Per-question `word_review` calls were already made in State B; do NOT re-submit them in State D's payload.

### State E: Continue (`vocab-testme`)

- Re-call `persist action="due_words"` for the next batch (the algorithm will return updated due-list — recently-rated items are pushed forward in their schedule).
- **NEVER re-call `coach_context` within the same skill session.** It is cached server-side (5-min TTL). Only `due_words` needs re-reading for the next batch.

End-of-batch buttons:

```json
[["🎯 再考一组|vocab-testme", "🧭 练习其他|nav:main"]]
```

**Critical**: send the batch summary + buttons in **one** `tg_msg type="keyboard"` call.

## 4. Collaborates With

- `planner`: routes here after `vocab-topic` or when `vocab.production` lags `vocab.recall`.
- `learner-state`: reads `samples` rows + per-word `word_reviews`; updates `MEMORY.md` `Vocabulary Profile`.
- `planner`: (proactive nudge) uses error keys (`collocation_error` / `register_mismatch` / `paraphrase_miss`) to recommend the next drill.
- `vocab-review` / `vocab-topic`: companion skills — use TestMe to verify, Review for due-flow, Topic for new clusters.
- `support/data-contract`: defines the `persist` write protocol.

## 5. Failure And Fallbacks

- `tg_msg type="quiz"` should NEVER be used — always use `tg_msg type="keyboard"` with option buttons.
- User taps the same option twice rapidly → debounce: ignore the second; persist only one `word_review`.
- Production answer is in Chinese → ask once for an English answer; if user refuses, grade as `rating=1` (didn't use the word) and proceed.
- `persist action="word_review"` fails on one card → still send the 1-line note, but mention "未保存，下次还会出现"; continue to the next question.
- Batch interrupted → State D is **not** written. Each per-word `word_review` from State B is already saved.
- All distractors look too plausible (bug in generation) → re-roll the question once before sending; if it still won't generate well, swap to a different format for that word.

## 6. Hard Rules

1. **Edge items only.** Never test items with `mastery = 'mastered'` — that would invert the SRS economy.
2. **5 formats, mixed.** No batch can have more than 2 items in the same format. Variety is the point.
3. **1-line note per question.** No paragraphs. The user is in a quiz tempo, not a lecture.
4. **Production graded generously.** Any natural sentence using the word counts as `rating=4`; "right word, awkward context" is `rating=3`. Don't grade grammar of unrelated sentence parts.
5. **Word_review per card, not per batch.** Persist each rating in State B as it happens — do NOT batch them into State D's payload.
6. **Cap at 8 items.** Larger batches lose the user; SRS is fed at a sustainable rhythm.
7. Use `persist` for reads/writes; no raw DB.
8. Don't update `MEMORY.md`; `learner-state` owns durable vocab state.
9. **One-call keyboard** for the batch summary. Never `type="text"` then `type="edit"` to attach buttons.
10. **Callback = 2 tools max per question.** Answer callback → `persist word_review` + `tg_msg` (note + next question or batch summary). No context re-reads between questions.
11. **Skip coach_context on continue.** Within the same batch, do NOT re-read `coach_context`. The data from batch start is still valid.
