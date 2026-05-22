---
name: vocab-harvest
description: "MUST trigger when the user explicitly asks to save a word/phrase ('Add this to my flashcards', 'what does this mean?'), OR when a reading/listening practice session concludes and high-value collocations need to be extracted into the SRS database."
---

# Global Vocabulary Harvest (Active & Passive)

Helper skill — **not** a practice loop. Saves words / chunks into the SRS queue with full context, either on user request or as a passive auto-call from another skill (reading-article, writing-rewrite, writing-journal, listening-podcast). Does NOT have its own state machine, tier, or credit gating; it produces `word_upsert` actions only.

## 1. When to Use

**Active triggers** (user asked):

- `把这个加进生词本`, `save this word`, `add to flashcards`.
- A direct dictionary question: `what does X mean?`, `X 是什么意思？`.

**Passive triggers** (called by another skill):

- End of `reading-article` to extract 3–5 collocations from the passage.
- End of `writing-rewrite` to harvest the takeaway-chunk teaching point.
- End of `writing-journal` to save the polished phrasal verb / idiom.
- End of `listening-podcast` if a key collocation carried the pivot.

For active scenarios, optionally call `persist {"action":"recent_practice","skill_type":"vocab","limit":10}` to dedup — don't surface the `[➕ 加入生词本]` button if the user just saved the same word in the last 10 minutes.

## 2. Workflow

### Scenario A — User asked a dictionary question

1. **Explain** the meaning concisely. One short paragraph + 1 native example sentence.
2. **Offer the save**: send a single `tg_msg type="keyboard"` with text + button:

   Buttons:

   ```json
   [["➕ 加入生词本|vh_save:<word>"]]
   ```

3. Wait. If the user taps `vh_save:<word>`, run Scenario C with `is_user_word=1`.
4. If the user does not tap, do NOT auto-save (active triggers respect user agency).

### Scenario B — Passive auto-harvest

1. Identify 1–3 high-value chunks from the just-completed practice. Single common words don't count — must be collocations / phrasal verbs / discourse markers / domain phrases.
2. Run Scenario C silently for each chunk with `is_user_word=0`.
3. **Notify (text only)** at the end of the host skill's feedback message — naturally, no button:

   ```text
   💡 顺便一提，已经把 "X" 和 "Y" 放进生词本咯。
   ```

   Do NOT show a `[➕ 加入生词本]` button in passive mode (the save already happened).

### Scenario C — Persistence (the core action)

1. **Optional lookup**: `persist action="word_lookup"` if you need to check whether the item already exists. If it does, update the existing row (the persist tool de-dupes on `word`).
2. **Upsert**:

   ```json
   {
     "action": "word_upsert",
     "word": "procrastinate",
     "ipa": "/prəˈkræstɪˌneɪt/",
     "meaning": "拖延; 推迟去做",
     "example_sentence": "<the EXACT sentence the user encountered it in — their own journal sentence, the reading passage line, or the model rewrite — never a generic dictionary example>",
     "mastery": "queued_new",
     "is_user_word": 1,
     "origin": "<one of: practice_harvest | reading.deepdive | writing.rewrite | writing.journal | listening.podcast | dictionary_lookup>",
     "topic_tag": "<optional, only if the host skill is topic-tagged (vocab-topic, certain reading/writing topics)>"
   }
   ```

3. The persist tool sets `srs_due` and initial `ease` automatically. Do NOT set them manually.

## 3. Persist (Data Contract)

This skill writes only `word_upsert` (and optional `word_lookup`) actions. It does **not** write `samples` rows — the host skill's own State D writes the practice sample, and `vocab-harvest` only adds vocabulary side-effects.

`activity_log` is updated automatically by `word_upsert`.

## 4. Hard Rules

1. **Context is king.** NEVER save a word with a generic dictionary example sentence if you can use the exact sentence the user just read / wrote / heard. The SRS engine relies on contextual memory.
2. **No spammy buttons.** The `[➕ 加入生词本]` button appears ONLY in Scenario A (user asked). Passive auto-harvest in Scenario B uses gentle text notification, no button.
3. **`is_user_word` mapping is strict.** Active = `1` (highest SRS priority). Passive = `0`.
4. **No single common words from passive harvest.** A passive call with `word="said"` or `word="people"` is a bug — the host skill should pick collocations / phrasal verbs / domain phrases, not closed-class items.
5. **`origin` is mandatory.** `learner-state` reads it to balance "user-asked" vs "auto-pulled" items in due-flow.
6. Use `persist` for all writes; no raw DB.
