---
name: listening-dictation
description: "MUST trigger when the user asks for dictation, intensive listening, spelling practice, or mentions they cannot catch fast speech/connected speech. This is the primary strength-training module for listening."
---

# Listening Dictation (Intensive & Adaptive)

## 1. When to Use (Trigger Contexts)
- User phrases: "听写", "dictation", "精听一段", "I want to practice listening deeply."
- Callback/System triggers: `listening-dictation`
- Diagnostic triggers: User recently had high `function_word_miss` or `connected_speech_fail` errors.

## 2. Adaptive Sentence Scaling (CRITICAL Constraint)
Before generating or selecting ANY sentence, you MUST read the user's current listening level from `MEMORY.md` (or infer from their profile) and strictly adhere to this scaling table. **Never overwhelm the user.**

| User Level (Band) | Word Count Limit | Syntactic Complexity | Audio Speed | Accent Variation |
| :--- | :--- | :--- | :--- | :--- |
| **Beginner** (< 5.0) | **6-10 words** | Simple SVO. No subordinate clauses. | Slower (-10%) | Standard US/UK only |
| **Intermediate** (5.0-6.0)| **11-16 words** | Max 1 relative or subordinate clause. | Normal speed | Standard US/UK only |
| **Advanced** (6.5+) | **17-25 words** | Complex sentences, 1+ connected speech feature (elision/assimilation). | Normal speed | **Inject 1 non-standard accent (e.g., Australian, Indian) every 3 sentences.** |

## 3. Workflow (Step-by-Step)
Execute these steps strictly in order for each sentence. Default session length is **3 sentences**. After sentence 3, you MUST ask whether to continue with another group or end.

**Step 1: Target Acquisition (The "Revenge" Protocol)**
- *Query `study.db`*: Look for sentences the user failed (e.g., missed function words) at least 3 days ago.
- *If found*: **REUSE** the `audio_path` from the database. Do NOT call the TTS tool.
- *If none found*: Generate a new sentence adhering to the Scaling Table. Call the `tts` tool to generate the audio.

**Step 2: Delivery & UI Setup**
- Send the audio to the user.
- **Reply rule (MANDATORY):**
  - The **audio message should NOT reply** to any message.
  - The **instruction / question message MUST reply to the audio message** so the thread is visually clear.
- **Tone rule:** Sound natural and conversational, like a supportive coach chatting with the learner. Avoid blunt labels like "第 2 题，继续". Prefer warm, human prompts such as "来，听听这一句。把你听到的英文打出来。"
- **MANDATORY UI**: Immediately after the audio, send a text or keyboard message that:
  1. asks the learner to type what they heard,
  2. tells them they can also tap the buttons below for help,
  3. uses **Chinese button labels**.
- Recommended keyboard layout (keep it compact):
  - Row 1: `[🐢 放慢一点]`, `[💡 给点提示]`
  - Row 2: `[😵 句子太难]`
- Wait for the user to type what they heard or click/type an option.

**Step 3: Handle Feedback (If an option is chosen)**
- `[🐢 放慢一点]`: Briefly acknowledge, generate/send a slower version (-10% rate), and wait again. The new instruction message MUST again reply to the latest audio.
- `[😵 句子太难]`: Acknowledge naturally, reveal the sentence, explain the hard vocabulary or chunk, and **drop the difficulty tier** for the next sentence.
- `[💡 给点提示]`: Reply with first-letter hints (e.g., `T_ p______ i_...`) and invite another try.
- Log any button usage to `activity_log`.

**Step 4: Evaluation & Diff**
- Once the user submits their dictation, perform a strict **word-by-word diff**.
- Visually highlight the exact missing/wrong words.
- Keep the correction readable in chat format.

**Step 5: Review, Error Analysis & Gloss**
After each answer, reveal the correct sentence and include:
1. the correct full sentence,
2. a concise Chinese translation,
3. a short gloss for useful chunks or tricky pronunciation,
4. **a brief error analysis / 易错点** when applicable.

The feedback should not stop at only "哪里对/哪里错". Prefer useful guidance such as:
- article / determiner misses (`a`, `the`, `this`),
- singular/plural ending misses,
- near-sound confusion (`task` vs `test`),
- connected-speech decoding issues,
- function-word drop due to weak attention.

Keep the analysis concise but highly actionable.

## 4. End-of-Group UX (MANDATORY)
- A standard group = **3 sentences**.
- After the 3rd sentence is reviewed, you MUST send an **inline keyboard in Chinese** asking what to do next.
- Recommended compact layout:
  - Row 1: `[🔄 再来一组]`, `[🧭 练习其他]`
- Do not end with plain text only when the 3-sentence group is complete.
- **Note**: 
  - If the user selects `[🔄 再来一组]`, immediately start the next group of 3 sentences.
  - If the user selects `[🧭 练习其他]`, it acts as returning to the main menu or re-initiating practice. Do not generate further listening tasks. 
  - (If the user explicitly types they want to quit or ignore the buttons, simply end the session warmly.)

## 5. Persist (Data Contract)
You MUST use the `db` tool to log the practice data strictly following this schema. Do NOT update `MEMORY.md` directly.
- **Table `samples`**: Insert a row with `skill_type="listening.dictation"`, `load_score=2`. Log the accuracy percentage in `feedback`. If TTS was used, save the `audio_path` here for future Revenge Protocol use.
- **Table `errors`**: For every missed word, insert a row. Use canonical keys: `function_word_miss`, `spelling_error`, or `connected_speech_fail`.
- **Table `activity_log`**: Log if any UI buttons (`放慢一点`, `有点难`, `给提示`) were used.

## 6. Hard Rules
1. **No Early Reveals**: NEVER show the English transcript on the first listen unless the user explicitly requests it or clicks `[😵 句子太难]`.
2. **Be Specific**: Diff every word. Do not just say "Good job" if they missed an `s`, an article, or a function word.
3. **Circuit Breaker**: If their accuracy drops below 40% on a sentence, you MUST immediately drop down one tier in the Scaling Table for the next sentence. Do not let them get frustrated.
4. **Reply Hygiene**: Audio never replies. Prompt/instruction messages reply to the corresponding audio.
5. **Natural Chat Tone**: Keep the teaching voice supportive, natural, and conversational — not robotic or overly terse.
6. **Post-Group Choice**: After a 3-sentence set, always use inline keyboard choices in Chinese for next action.
