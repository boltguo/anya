---
name: vocab-review
description: "MUST trigger when the user asks to review vocabulary, check their memory, study words, or do flashcards. This manages the core Spaced Repetition System (SRS)."
---

# Vocabulary Review (SRS & Micro-lessons)

## 1. When to Use (Trigger Contexts)
- User phrases: "背单词", "review words", "flashcards", "考考我昨天的词"
- Callback/System triggers: `vocab-review`

## 2. Adaptive Batching (CRITICAL Constraint)
Before starting, call `persist` with `{"action":"due_words","limit":8}` to get due SRS items.
- A standard review batch is **5-8 words**. Do NOT overwhelm the user with 20 words at once.

## 3. Workflow (State Machine)
Execute these steps strictly as a two-turn state machine for EACH word in the batch:

### State A: Active Recall (The Flashcard)
For the current word in the batch, present a flashcard test.
- **MANDATORY Audio**: Send a voice message (`tts`) for the word. You MUST use SSML `<break>` tags for the phonetic segmented breakdown. 
  - Format: Word (Normal speed) x 3, Segmented Breakdown x 1, Example Sentence x 1.
  - Example TTS text: `apple. apple. apple. ap <break time="500ms"/> ple. I ate an apple.`
- **MANDATORY Hidden Meaning**: Do NOT show the Chinese meaning or the full definition yet. 
- Present the word and its phonetic spelling (IPA) if available. Provide a short, engaging fill-in-the-blank example sentence using the word, OR ask a clever question (e.g., "If you are 'exhausted', are you full of energy or ready to sleep?").
- **MANDATORY UI**: Send an inline keyboard (`tg_msg` tool `type: "keyboard"`) with Chinese buttons representing the user's memory state:
  - Row 1: `[🎯 秒懂 (Easy)|srs:easy:word]`, `[🤔 模糊 (Hard)|srs:hard:word]`
  - Row 2: `[❌ 忘了 (Again)|srs:again:word]`
- **STOP AND WAIT**. Do not generate the lesson yet. Wait for the user to click a callback button.

### State B: Handle Feedback & Reveal (Micro-lesson)
When you receive the user's callback click (`srs:easy`, `srs:hard`, or `srs:again`):

1. **Persist SRS Feedback via `persist` tool**:
   - `[🎯 秒懂]`: call `persist action="word_review"` with `rating=5`.
   - `[🤔 模糊]`: call `persist action="word_review"` with `rating=3`.
   - `[❌ 忘了]`: call `persist action="word_review"` with `rating=1`. **Add this word to the end of the current batch to be tested again**.
   - The tool updates counters, `srs_due`, interval, ease, `word_reviews`, and mastery.

2. **Reveal Micro-lesson (MANDATORY Layout)**:
   Reply to the user with this exact, scannable format:
   * **[Word]** /IPA/ 
   * 📖 **释义**: [Concise Chinese meaning]
   * 🔪 **拆解 (Etymology)**: [Explain prefix/root/suffix. E.g., in-(not) + vincible(conquer) = invincible] *Only if applicable.*
   * 🗣️ **地道平替 (Native Slang/Idiom)**: [1 casual/native alternative. E.g., instead of 'exhausted', say 'wiped out'].
   * 📝 **高频搭配 (Collocation)**: [1-2 common word combinations. E.g., 'heavily rely on'].

3. **Proceed**: If the batch is not finished, automatically loop back to **State A** and present the next word. If finished, proceed to Step 4.

## 4. End-of-Group UX (MANDATORY)
After the batch of 5-8 words is complete (including any `[❌ 忘了]` words that were re-tested), you MUST send an inline keyboard:
- Row 1: `[🔄 再背一组|vocab-review]`, `[🧭 练习其他|nav:main]`

## 5. Persist (Data Contract)

**Follow `support/data-contract/references/post-practice-protocol.md` for all writes.** Do NOT update MEMORY.md — `learner-state` skill handles that.

After the entire batch is complete:

1. **`samples`** row — one per batch:
   - `skill_type = 'vocab'`
   - `prompt = 'review-batch'`
   - `response` = comma-separated results (e.g. `"resilient:pass, fluctuate:fail, elaborate:pass"`)
   - `accuracy` = easy+hard / total (0.0–1.0). `again` = fail.
   - `raw_score` = pass count, `max_score` = total words tested
   - `load_score = 2`
   - `feedback` = A concise but detailed textual analysis of this specific attempt. Write about what exactly the user missed, the root cause, and overall performance. Do NOT use JSON.
     Example: "The user struggled with relative clauses and vocabulary precision, but maintained good overall flow."

2. **`word_review` actions** — one per word during the batch (already in State B).

3. **`activity_log`** — updated automatically by `persist`.

## 6. Hard Rules
1. **No Info Dumping**: The Micro-lesson MUST be concise. Do not write paragraphs of text. Use the emojis and bolding as shown.
2. **Active Recall First**: NEVER reveal the meaning before the user clicks a memory button. The effort of trying to remember is what builds neural pathways.
3. **Audio Mandatory**: Every flashcard MUST include the TTS audio with SSML breaks as specified in State A.
4. **Re-test Failures**: If they click `[❌ 忘了]`, they MUST see that word again before the batch ends.
