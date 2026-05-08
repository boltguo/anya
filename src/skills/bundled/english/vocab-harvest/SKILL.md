---
name: vocab-harvest
description: "MUST trigger when the user explicitly asks to save a word/phrase ('Add this to my flashcards', 'what does this mean?'), OR when a reading/listening practice session concludes and high-value collocations need to be extracted into the SRS database."
---

# Global Vocabulary Harvest (Active & Passive)

## 1. When to Use (Trigger Contexts)
- **Active Triggers**: "把这个加进生词本", "save this word", "add to flashcards", "what does X mean?"
- **Passive Triggers**: Automatically triggered at the end of `reading-deepdive` to extract 2-3 collocations, or when Anya provides a "Native Polish" in `writing-builder` or `writing-journal` and extracts the native phrase.

## 2. Workflow (Step-by-Step)

**Scenario A: The User Actively Asked a Question (e.g., "What does 'procrastinate' mean?")**
1. **Explain**: Explain the meaning clearly and concisely. Provide 1 native example sentence.
2. **MANDATORY UI**: Attach an inline keyboard: `[➕ 加入生词本]`.
3. Wait for the user's action. If they click the button, execute Scenario C (Vocabulary Persistence).

**Scenario B: Passive Auto-Harvest (e.g., After Reading/Writing Practice)**
1. **Identify the Gold**: Based on the preceding practice session, identify 1-3 highly useful chunks, idioms, or collocations that the user struggled with or that are central to the text.
2. **Save**: Silently proceed to Scenario C to save them.
3. **Notify (Text Only)**: At the end of your feedback message for that practice session, naturally mention: *(💡 顺便一提，我已经把你刚才不会用的 "X" 和 "Y" 放进生词本咯)*. Do NOT use a button here.

**Scenario C: Vocabulary Persistence (The Core Action)**
1. **Optional lookup**: Use `persist action="word_lookup"` if you need to check whether the item already exists.
2. **Upsert**: Use `persist action="word_upsert"` to save the word/phrase.
   - Set `mastery="queued_new"`.
   - If user actively asked for it, set `is_user_word=1` (Highest priority in SRS). Otherwise, set it to 0.
   - Set `origin="practice_harvest"`.
   - MUST include the Chinese definition, IPA, and the exact sentence the user encountered it in (e.g., their own journal sentence or the reading text).

## 3. Persist (Data Contract)
- Use only `persist action="word_upsert"` for vocabulary writes. It fuels the `vocab-review` engine.

## 4. Hard Rules
1. **Context is King**: NEVER save a word with a generic dictionary example sentence if you can use the exact sentence the user just read or tried to write. The SRS engine relies on contextual memory.
2. **No Spammy Buttons**: Only provide the `[➕ 加入生词本]` button when the user asks a direct dictionary question. For auto-harvests after practice, just notify them gently in the text.
