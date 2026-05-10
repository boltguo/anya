---
name: reading-deepdive
description: "MUST trigger for intensive reading comprehension. Focuses on deep syntax analysis and logic mapping without time limits. Trigger for '精读', 'read carefully', 'deep reading', 'analyze article'."
---

# Reading Deep Dive (Syntax & Logic)

Intensive untimed reading. One passage at a time: deliver text, support with on-demand syntax / vocab / structure scaffolds, ask the learner to articulate the **logic** of the passage in their own words, grade against a rubric, auto-harvest 2-3 high-value chunks, persist, then adapt the next passage by i+1.

## 1. Inputs

Trigger when:

- User says: `精读`, `read carefully`, `deep reading`, `analyze this`, `这段什么意思`, `句子太绕`.
- Callback `reading-deepdive`.
- Planner/coach routes here for weak `reading.syntax_parsing` / `reading.gist` / `inference_error` / repeated `paraphrase_miss`.

Required context before generating:

1. `persist {"action":"recent_practice","session_id":"<session>","skill_type":"reading.deepdive","limit":20}` (`limit` int). Returns rows + `recent_prompt_hashes`. Source of truth for §2.3 credit and §2.4 dedup; do not duplicate hashes in `metadata`.
2. `persist {"action":"coach_context","days":14,"limit":8}` for subcaps / errors / due tasks. Slow signal — only re-call when tier changes.
3. `MEMORY.md` / `USER.md` only as fallback. No raw `study.db` access.

## 2. Difficulty Policy

Target **i+1**: one stretch above the learner's last successful logic-grasp. Adapt length, syntactic density, abstraction; never combine multiple stretches in one round. Untimed — pace is **not** scored here (use `reading-skim-drill` for pace).

### 2.0 Constants & Tier

| Constant | Value | Meaning |
| --- | --- | --- |
| `PASS_THRESHOLD` | `0.70` | A round with `accuracy ≥ PASS` is a pass. Lower than dictation because rubric grading is forgiving by design. |
| `FAIL_THRESHOLD` | `0.40` | Below = fail. Wider hold band reflects rubric noise. |
| `STREAK` | `2` | Passes/fails to move tier. |
| `ACC_WINDOW` | `3` | Sample window for §2.2 mean. |
| `DEDUP_WINDOW` | `20` | Rolling `prompt_hash` window. |

**Score rubric (CRITICAL — use verbatim to grade the learner's own-words logic recap):**

| Score | Rubric |
| --- | --- |
| `1.00` | Main claim + reasoning chain captured precisely. |
| `0.85` | Main claim captured; reasoning chain has 1 vague link but recoverable. |
| `0.70` | Main claim correct; missed one supporting move (counter / pivot / qualifier). |
| `0.50` | Picked up one supporting fact but missed the main thrust. |
| `0.25` | Off-topic but at least the domain was right (e.g., user said "about climate" when actual claim is about climate **policy tradeoffs**). |
| `0.00` | Off / hallucinated content / no answer. |

Use this rubric verbatim — do **not** reward word count, English grammar, or detail recall. This skill measures **comprehension of the argument**, nothing else. Granular `reading.gist` / `reading.syntax_parsing` subcaps go into `subcap_scores` separately.

| Tier (IELTS band ≈ CEFR) | Words | Genre & syntax |
| --- | --- | --- |
| Beginner (< 5.0 ≈ A1–A2) | 100–150 | Simple narrative or descriptive; mostly SVO; concrete topics |
| Intermediate (5.0–6.0 ≈ B1) | 150–200 | Argumentative with clear topic/support structure; 1–2 subordinate clauses per sentence |
| Advanced (≥ 6.5 ≈ B2+) | 200–300 | Dense academic / opinion-led; inversions, heavy nominalization, embedded clauses (Scientific American / Economist style) |

**Reading the learner's level from `MEMORY.md`** (do NOT confuse capability score 0–100 with IELTS band 0–9):

1. Prefer `Band Snapshot.Reading` (CEFR string). Map: `A1`/`A2` → Beginner, `B1` → Intermediate, `B2`/`C1`/`C2` → Advanced.
2. Boundary suffix (`A2+`, `B1-`): **降一级起步**.
3. If CEFR missing, fall back to 14-day `reading.gist` + `reading.syntax_parsing` average from `coach_context.summary.subcaps` (0–10) and use the tier table above.
4. **Never** read `Core Capabilities.Reading: <n>/100` as IELTS band — that's a 0–100 capability score.

### 2.2 Recent-accuracy

Mean `accuracy` over last `ACC_WINDOW` `completed=1` rows of current `session_id` + `skill_type`. Abandoned (`completed=0`) excluded from mean but count as fail for `demotion_credit`.

Fallback chain when fewer than `ACC_WINDOW` rows: 14-day mean from `coach_context.summary` → `MEMORY.md` band − 1 tier at shortest passage → Beginner 100-word narrative. Never guess upward.

### 2.3 Credit gating

```
promotion_credit = walk recent_practice.rows newest→oldest (skip redo_count>0):
  count consecutive accuracy ≥ PASS; reset on any fail (< FAIL or completed=0); holds ([FAIL, PASS)) pass through.
demotion_credit = mirror.
abandoned (completed=0) = 1 fail.
```

| Credit | Action |
| --- | --- |
| `promotion_credit ≥ STREAK` at tier ceiling | Promote tier; reset both credits; start at next tier's shortest passage. |
| `promotion_credit ≥ STREAK` inside tier | Words **+30** (clamped to tier max); allow one more subordinate clause per sentence; reset `promotion_credit`. |
| `demotion_credit ≥ STREAK` at tier floor | Demote tier; reset both credits; start at prev tier's longest passage. |
| `demotion_credit ≥ STREAK` inside tier | Words **−30** (clamped to tier min); reduce embedded clauses; reset `demotion_credit`. |
| `dd_abandon` tap | Persists abandoned row (State B); surfaces as fail next call. |

Retry rows (`redo_count > 0`) skipped from credit; still count for dedup.

Hold: keep length / tier; swap genre (narrative ↔ argumentative ↔ descriptive within the tier's allowed range).

`dd_syntax` / `dd_vocab` / `dd_outline` taps do NOT change credit (they're scaffolds, not signals of failure). They are recorded in `ui_feedback` so a "got the logic only after structure-hint" attempt is visible to `learner-state`.

### 2.4 Generation

- Pick a topic that overlaps the user's interests (`USER.md`/`MEMORY.md`) when known; otherwise default to a general-interest topic appropriate for the tier.
- Stretch **at most one** dimension per round: words, syntactic density, abstraction.
- Reject any passage whose `prompt_hash` ∈ `recent_practice.recent_prompt_hashes`.
- Don't repeat the same genre family for 2+ consecutive rounds.
- Each passage MUST have at least one **killer sentence** (long subordinate / inverted / heavily nominalized) so `dd_syntax` has something to operate on.

## 3. Flow

### State A: Prepare And Deliver

1. From §2.3 + `coach_context`, decide tier, word count, genre, killer-sentence target.
2. Generate the passage. Compute `prompt_hash`; regenerate on dedup hit.
3. Send the passage in a `tg_msg type="text"` call (plain text — no time pressure, no hide).
4. Send a separate `tg_msg type="keyboard"` (no media):

   Text:

   ```text
   📖 慢慢读，不用急。读完用一句话告诉我：**这段话的核心论点和它是怎么被支撑的**？(中英文都行)
   ```

   Buttons:

   ```json
   [["😵 句子太绕|dd_syntax", "📚 生词太多|dd_vocab"], ["💡 提示一下结构|dd_outline", "🛑 完全读不动|dd_abandon"]]
   ```

5. Init empty `ui_feedback` accumulator; every button tap appends its exact label.
6. `force_reply` for the user's logic recap (after they read). Wait for typed answer or button tap.

### State B: Button Handling (before answering)

`dd_syntax`:

- Append `😵 句子太绕` to `ui_feedback`.
- Identify the longest / hardest sentence in the passage. Break it down: Subject → main Verb → Object → modifiers → embedded clauses, with a 1-line Chinese gloss of how the grammar holds it together (the "why" — see Hard Rule 2).
- Re-send the same keyboard so user can tap another scaffold or just answer.

`dd_vocab`:

- Append `📚 生词太多` to `ui_feedback`.
- Provide a mini-glossary of the **3 hardest** words: word / IPA / Chinese gloss / how it's used in this passage (1-line context). Don't dump the dictionary entry.
- Re-send the same keyboard.

`dd_outline`:

- Append `💡 提示一下结构` to `ui_feedback`.
- Provide a **3-bullet** structural map in Chinese: paragraph 1 function / paragraph 2 function / paragraph 3 function (or sentence-level if single paragraph). Do NOT give the main claim — the user still has to articulate that.
- Re-send the same keyboard.

`dd_abandon`:

1. **Persist abandoned record FIRST**:

   ```
   completed=0, accuracy=0, response="",
   feedback="Learner tapped '🛑 完全读不动'. Treat as strong negative evidence at this tier/genre.",
   ui_feedback="<accumulated labels including 🛑 完全读不动>", load_score=0, minutes=0,
   metadata={"abandoned_reason":"too_hard","tier":"<beginner|intermediate|advanced>","words":<n>,"genre":"<genre>"}
   ```

   After `persist` returns, reset `ui_feedback`.

2. **Replacement.** Apply demotion (§2.3). Brief Chinese ack, generate a shorter / easier passage → State A.

### State C: Evaluate

When the user submits their logic recap:

1. **Do NOT correct grammar / spelling** in their answer. Focus only on argument comprehension.
2. **Grade against §2.0 rubric** to produce continuous `accuracy` (0..1). Identify whether they got tricked by a counter-claim, a hedging qualifier, or a paragraph-jump.
3. Compute subcap scores:
   - `reading.gist` (0–10) ≈ `accuracy * 10` refined with one-line evidence.
   - `reading.syntax_parsing` (0–10) — set lower if `dd_syntax` was tapped (means killer-sentence wasn't self-parseable).
4. **Auto Vocabulary Harvest**: extract 2–3 high-value collocations / chunks from the passage (not single common words). For each, call `persist action="word_upsert"` with `mastery="queued_new"`, `is_user_word=0`, `origin="reading.deepdive"`, plus the exact in-passage sentence as `example_sentence`.
5. **Persist FIRST, THEN feedback**. Sequential.

Feedback message must include:

- A brief Chinese evaluation of their logic grasp; name the specific paragraph or pivot they got vs missed.
- The actual main claim (your canonical 1-sentence answer in Chinese).
- One **killer sentence** parsed (Subject / Verb / Object + how the grammar holds it). Mandatory regardless of whether `dd_syntax` was tapped — this is the deep-dive teaching moment.
- A 1-line note: "已经把 `X` 和 `Y` 加进生词本" (the auto-harvest collocations).

Buttons (always, regardless of accuracy):

```json
[["📖 再读一篇|dd_next", "🧭 练习其他|nav:main"]]
```

**Critical**: feedback + buttons in **one** `tg_msg type="keyboard"` call. The killer-sentence parse can be inside the same feedback body. Never `type="text"` then `type="edit"` to attach buttons.

### State D: Persist Evidence

Call `persist` with `action="practice"` (or omit `action`).

Minimum payload:

```json
{
  "skill_type": "reading.deepdive",
  "session_id": "<session>",
  "prompt": "<the full passage text>",
  "prompt_hash": "<sha1(normalized prompt) first 16 chars>",
  "response": "<user's logic recap, exactly as typed>",
  "accuracy": 0.70,
  "raw_score": 0.70,
  "max_score": 1,
  "feedback": "<IN ENGLISH for DB / learner-state> Captured the main claim (renewable energy adoption is uneven across regions) but missed the pivot — the passage's argument is that this unevenness is mostly driven by policy, not technology. Killer sentence (line 3) had a fronted concessive clause that scaffolding helped them parse.",
  "section": "reading",
  "domain": "reading",
  "load_score": 2,
  "minutes": 4,
  "mode": "study",
  "ui_feedback": "<comma-joined exact button labels tapped this round, e.g. '😵 句子太绕,💡 提示一下结构' — empty if none>",
  "metadata": "{\"tier\":\"intermediate\",\"words\":180,\"genre\":\"argumentative\",\"killer_sentence_idx\":2,\"harvested_chunks\":[\"uneven adoption\",\"policy-driven\"],\"promotion_credit_after\":1,\"demotion_credit_after\":0}",
  "errors": "[{\"key\":\"inference_error\",\"category\":\"reading\",\"severity\":\"medium\",\"original\":\"\",\"correction\":\"\",\"note\":\"Attributed the unevenness to technology gap; passage's pivot was that policy is the actual driver.\"}]",
  "subcap_scores": "[{\"key\":\"reading.gist\",\"score\":7.0,\"evidence\":\"Main claim correct; pivot direction missed.\"},{\"key\":\"reading.syntax_parsing\",\"score\":6.0,\"evidence\":\"Used dd_syntax scaffold — fronted concessive needed help.\"}]"
}
```

`prompt_hash` = first 16 hex chars of `SHA-1(normalized prompt)`; normalize = lowercase + strip punctuation + collapse whitespace.

`ui_feedback` mandatory if any button was tapped (including the read-aid scaffolds).

State D persists fully-attempted passages only. Abandoned rows are written in State B.

In **parallel** to this practice persist, call `word_upsert` for each harvested chunk (separate calls; don't batch into the practice payload).

### State E: Continue (`dd_next`)

- Re-call `persist action="recent_practice"` (§1) for credits + dedup.
- Apply §2.3 (skip `redo_count > 0`) before generating.
- Skip `coach_context` re-call unless tier changed.
- Generate next passage (State A step 2 — incl. dedup). Respect "no same genre family twice in a row" (§2.4).

## 4. Collaborates With

- `planner`: routes here when `reading.syntax_parsing` / `reading.gist` is the highest-value drill.
- `learner-state`: reads persisted evidence; updates `MEMORY.md`.
- `coach`: uses errors / subcap scores to explain pivot misses.
- `vocab-harvest` / `vocab-review`: auto-called in State C to seed the SRS queue with passage chunks.
- `reading-skim-drill`: graduates to skim once syntax is no longer the bottleneck.
- `writing-rewrite`: hand off if a paragraph in the passage is upgrade-worthy.
- `support/data-contract`: defines the `persist` write protocol.

## 5. Failure And Fallbacks

- User answers in 2 words ("讲气候") → grade per rubric (likely 0.25 for "domain right, claim missed"); ask once if they want to elaborate before persisting; if they say no, persist as-is.
- User answers in fluent English explaining a different passage entirely → grade `0.00`; gently ask if they read this one; if user confirms confusion, treat as fail and demote.
- `force_reply` ignored for >5 min → no auto-fail; user is reading. Wait.
- `persist` (practice or word_upsert) fails → still send feedback; mention what didn't save.
- `<tg-spoiler>` is client-side; no callback. Don't invent `spoiler_used`.

## 6. Hard Rules

1. **No time limits.** NEVER rush the user. Pace is `reading-skim-drill`'s job.
2. **The "Why" rule.** When parsing a killer sentence, do NOT just translate. Explain *how* the grammar holds the sentence together (which clause modifies which, why the verb is fronted, etc.).
3. **One killer sentence parsed every round** — even on `accuracy=1.0`. The deep-dive's value is the syntax lesson, not just the score.
4. **Auto-harvest 2-3 chunks per passage.** Single common words don't count — must be collocations / phrasal verbs / discourse markers / domain phrases.
5. **Scaffolds aren't penalties.** `dd_syntax` / `dd_vocab` / `dd_outline` taps are recorded in `ui_feedback` but do NOT lower `accuracy` directly. The rubric grades the recap, not the path to it.
6. Use `persist` for reads/writes; no raw DB.
7. Don't update `MEMORY.md`; `learner-state` owns durable ability state.
8. **One-call keyboard.** Feedback + buttons go out in a single `tg_msg type="keyboard"` call. Never `type="text"` then `type="edit"` to attach buttons.
