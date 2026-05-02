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
Execute these steps strictly in order. Every practice session handles exactly **1 sentence**. After the sentence is evaluated, you MUST ask whether to continue with another sentence or practice something else.

**Step 1: Target Acquisition (The "Revenge" Protocol)**
- *Query `study.db`*: Look for sentences the user failed (e.g., missed function words) at least 3 days ago.
- *If found*: **REUSE** the `audio_path` from the database. Do NOT call the TTS tool.
- *If none found*: Generate a new sentence adhering to the Scaling Table. Call the `tts` tool to generate the audio.

**Step 2: Delivery & UI Setup**
> **Combine audio + keyboard in the same LLM turn** — call `tg(type=voice)` and `tg(type=keyboard)` together.

- Send the audio to the user via `tg(type=voice)`.
- **In the same turn**, send the instruction keyboard via `tg(type=keyboard)` with `reply_to` pointing to the audio's tag.
- **Reply rule:** Audio does NOT reply. Instruction keyboard MUST reply to the audio.
- **Tone:** Natural and conversational. "来，听听这一句。把你听到的英文打出来。"
- Recommended keyboard layout:
  - Row 1: `[🐢 放慢一点]`, `[💡 给点提示]`
  - Row 2: `[😵 句子太难]`
- **CRITICAL STOP**: After sending the voice and instruction keyboard, you MUST immediately end your turn. DO NOT proceed to Step 3 or Step 4. Stop generating and WAIT for the user to reply.

**Step 3: Handle Feedback (If an option is chosen)**
- `[🐢 放慢一点]`: Briefly acknowledge, generate/send a slower version (-10% rate), and wait again. The new instruction message MUST again reply to the latest audio.
- `[😵 句子太难]`: Acknowledge naturally, reveal the sentence, explain the hard vocabulary or chunk, and **drop the difficulty tier** for the next sentence.
- `[💡 给点提示]`: Reply with first-letter hints (e.g., `T_ p______ i_...`) and invite another try.
- Log any button usage to `activity_log`.

**Step 4: Evaluation, Feedback & Persist (ALL IN ONE TURN)**

> Call `tg(type=keyboard)` and `persist(...)` together in the **same LLM turn**.
> **STRICT PROHIBITION**: You are FORBIDDEN from using the `db` tool to write SQL. You MUST use the `persist` tool for post-practice logging.

- Perform a strict **word-by-word diff** of the user's submission vs correct sentence.
- Send a `tg(type=keyboard)` message containing:
  1. The correct full sentence
  2. A concise Chinese translation
  3. A brief error analysis (article misses, connected speech, near-sound confusion, etc.)
  4. Inline keyboard: Row 1: `[🔄 再来一句]`, `[🧭 练习其他]`
- **In the same turn**, call the `persist` tool using these JSON arguments to save data:

```json
{
  "skill_type": "listening.dictation",
  "session_id": "<session>",
  "prompt": "<correct sentence>",
  "response": "<user's typed text>",
  "accuracy": <correct_words / total_words>,
  "raw_score": <correct count>,
  "max_score": <total words>,
  "feedback": "<textual analysis of what user missed and why>",
  "audio_path": "<tts file path>",
  "load_score": 1,
  "minutes": 1,
  "errors": "[{\"key\":\"function_word_miss\",\"category\":\"listening\",\"correction\":\"the\",\"note\":\"冠词漏听\"}]",
  "subcap_scores": "[{\"key\":\"listening.connected_speech\",\"score\":4.5,\"evidence\":\"弱读冠词遗漏\"}]"
}
```

Error keys: `function_word_miss`, `spelling_error`, `connected_speech_fail`, `word_substitution`, `tense_miss`, `plural_miss`

- **Note**: 
  - If the user selects `[🔄 再来一句]`, immediately start the next sentence.
  - If the user selects `[🧭 练习其他]`, return to the main menu.

## 6. Hard Rules
1. **No Early Reveals**: NEVER show the English transcript on the first listen unless the user explicitly requests it or clicks `[😵 句子太难]`.
2. **Be Specific**: Diff every word. Do not just say "Good job" if they missed an `s`, an article, or a function word.
3. **Circuit Breaker**: If their accuracy drops below 40% on a sentence, you MUST immediately drop down one tier in the Scaling Table for the next sentence. Do not let them get frustrated.
4. **Reply Hygiene**: Audio never replies. Prompt/instruction messages reply to the corresponding audio.
5. **Natural Chat Tone**: Keep the teaching voice supportive, natural, and conversational — not robotic or overly terse.
6. **Post-Sentence Choice**: After every sentence, always use inline keyboard choices in Chinese for the next action.
