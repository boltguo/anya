---
name: vocab-review
description: "MUST trigger when the user asks to review vocabulary, check their memory, study words, or do flashcards. This manages the core Spaced Repetition System (SRS)."
---

# Vocabulary Review (SRS & Micro-lessons)

## 1. When to Use (Trigger Contexts)
- User phrases: "背单词", "review words", "flashcards", "考考我昨天的词"
- Callback/System triggers: `vocab-review`
- Scheduled trigger: Triggered by cron job `ielts-cron-word-review`.

## 2. Adaptive Batching (CRITICAL Constraint)
Before starting, query the `words` table in `study.db` for words where `mastery != 'mastered'` and `srs_due <= CURRENT_TIMESTAMP` (or words recently added). 
- A standard review batch is **5-8 words**. Do NOT overwhelm the user with 20 words at once.

## 3. Workflow (Step-by-Step)
Execute these steps for EACH word in the batch:

**Step 1: Active Recall (The Flashcard)**
- Present the word and its phonetic spelling (IPA) if available.
- **MANDATORY**: Do NOT show the Chinese meaning or the full definition yet. 
- Provide a short, engaging fill-in-the-blank example sentence using the word, OR ask a clever question (e.g., "If you are 'exhausted', are you full of energy or ready to sleep?").
- **MANDATORY UI**: Send an inline keyboard with Chinese buttons representing the user's memory state:
  - Row 1: `[🎯 秒懂 (Easy)]`, `[🤔 模糊 (Hard)]`
  - Row 2: `[❌ 忘了 (Again)]`

**Step 2: Handle Feedback & Reveal**
Wait for the user to click a button. Once clicked, REVEAL the word's details using the **Micro-lesson Format** (see below).

- `[🎯 秒懂]`: Praise them briefly. (Backend: Increase `success_count`, significantly increase `srs_interval`).
- `[🤔 模糊]`: Encourage them. (Backend: Increase `srs_interval` slightly).
- `[❌ 忘了]`: Reassure them ("It's okay, this is a tough one"). (Backend: Increase `fail_count`, reset `srs_interval` to 0, and **add this word to the end of the current batch to be tested again**).

**Step 3: The Micro-lesson Format (MANDATORY Layout)**
When revealing the answer, you MUST use this exact, scannable format:

* **[Word]** /IPA/ 
* 📖 **释义**: [Concise Chinese meaning]
* 🔪 **拆解 (Etymology)**: [Explain prefix/root/suffix. E.g., in-(not) + vincible(conquer) = invincible] *Only if applicable.*
* 🗣️ **地道平替 (Native Slang/Idiom)**: [1 casual/native alternative. E.g., instead of 'exhausted', say 'wiped out'].
* 📝 **高频搭配 (Collocation)**: [1-2 common word combinations. E.g., 'heavily rely on'].

## 4. End-of-Group UX (MANDATORY)
After the batch of 5-8 words is complete (including any `[❌ 忘了]` words that were re-tested), you MUST send an inline keyboard:
- Row 1: `[🔄 再背一组]`, `[🧭 练习其他]`

## 5. Persist (Data Contract)
You MUST use the `db` tool to update the `words` table for EACH word reviewed:
- Increment `review_count` by 1.
- Update `last_result` ('easy', 'hard', or 'again').
- Update `srs_due` based on the spaced repetition result.
- Update `mastery` level if they consistently get it right (e.g., 'learning' -> 'known' -> 'mastered').
- Log the button click (`easy`, `hard`, `again`) in `word_events` to track the history of this specific word.

## 6. Hard Rules
1. **No Info Dumping**: The Micro-lesson MUST be concise. Do not write paragraphs of text. Use the emojis and bolding as shown.
2. **Active Recall First**: NEVER reveal the meaning before the user clicks a memory button. The effort of trying to remember is what builds neural pathways.
3. **Re-test Failures**: If they click `[❌ 忘了]`, they MUST see that word again before the batch ends.
4. **Reply Hygiene**: The Micro-lesson reveal MUST reply to the Flashcard question message.
