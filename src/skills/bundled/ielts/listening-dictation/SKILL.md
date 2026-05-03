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
**STOP AND READ MEMORY:** Before generating or selecting ANY sentence, you MUST read the user's current listening level from `MEMORY.md` (or infer from their profile) and strictly adhere to this scaling table. The previous system logs indicate difficulty was too high because the user's level wasn't checked first. **Never overwhelm the user.** Focus heavily on the user's "Listening Profile -> sentence_length_tolerance" and "working memory / chunking limit".

| User Level (Band) | Length / Cognitive Chunks | Syntactic Complexity | Audio Speed | Accent Variation |
| :--- | :--- | :--- | :--- | :--- |
| **Beginner** (< 5.0) | **4-7 words** (1 cognitive chunk) | Simple SVO. No subordinate clauses. | Slower (-10%) | Standard US/UK only |
| **Intermediate** (5.0-6.0)| **8-12 words** (2 cognitive chunks)| Max 1 relative or subordinate clause. | Normal speed | Standard US/UK only |
| **Advanced** (6.5+) | **13-20 words** (3+ chunks) | Complex sentences, 1+ connected speech feature (elision/assimilation). | Normal speed | **Inject 1 non-standard accent (e.g., Australian, Indian) every 3 sentences.** |

## 3. Workflow (State Machine - STRICT EXECUTION)
You must follow these steps strictly to prevent hallucinations and ensure a standard procedure.

**CRITICAL TTS RULE**: The `tts` tool MUST ONLY be used to generate the target English practice sentence. NEVER use the `tts` tool to speak conversational fillers (e.g., "Let's make it easier", "Here is the next one"). If you need to speak to the user, use the `tg(type=text)` tool.

**State A: Prepare & Deliver (Listen)**
1. **Analyze Level & Add Threshold**: Read `MEMORY.md`. Base your difficulty on their level, but add a **+5% difficulty threshold** (e.g., slightly faster, or 1-2 words longer) to push their limits and ensure progress.
2. **Generate Audio**: Create the target sentence (or reuse from `study.db`) and use `tts` tool to get the audio. Send it via `tg(type=voice)`. (DO NOT generate TTS for your own conversational replies).
3. **Send Instruction (Same Turn)**: Use `tg(type=keyboard)` along with the voice message.
   - **Text**: Must include the hidden transcript. Example: "来，听听这一句。把你听到的英文打出来。\n\n实在听不出可以点开看原文：<tg-spoiler>[Insert original English text here]</tg-spoiler>"
   - **Buttons**: `[["🐢 慢速播放|dict_slow", "😵 太难了，换简单点|dict_hard"]]`
4. **CRITICAL STOP**: End your turn immediately. WAIT for the user to type their answer or click a button.

**State B: Handle Feedback Buttons (Before typing)**
If the user clicks a button:
- `dict_slow`: Briefly acknowledge via `tg(type=text)`, use `tts` with `rate="-10%"` on the SAME sentence, send new voice, and resend the instruction keyboard. Wait.
- `dict_hard`: **Lower the difficulty** (remove the +5% threshold, drop a tier). Acknowledge naturally via `tg(type=text)`, explain the hard vocabulary, generate a NEW simpler sentence via `tts`, and go back to **State A**.

**State C: Evaluation & Data Update (User types the answer)**
When the user submits their dictated text:
1. **Evaluate**: Perform a strict word-by-word diff.
2. **Execute Parallel Actions**: You MUST invoke BOTH `tg` and `persist` tools **concurrently/in parallel**. Do not call one, wait for the result, and call the other.
   - **Action 1 - Send Feedback (MANDATORY `tg` tool)**: Use `tg(type=keyboard)`.
     - **Text content**: Correct full sentence, concise Chinese translation, and **specific error analysis** (point out exactly which words were missed, e.g., articles, plurals, connected speech).
     - **Buttons**: `[["🔄 再来一句|dict_next", "🧭 练习其他|nav_main"]]`
   - **Action 2 - Data Update (MANDATORY `persist` tool)**: Log the practice data.
     ```json
     {
       "skill_type": "listening.dictation",
       "session_id": "<session>",
       "prompt": "<correct sentence>",
       "raw_content": "<user's typed text>",
       "accuracy": <correct_words / total_words>,
       "raw_score": <correct count>,
       "max_score": <total words>,
       "feedback": "<IN ENGLISH: textual analysis of what user missed and why>",
       "audio_path": "<tts file path>",
       "load_score": 1,
       "minutes": 1,
       "errors": "[{\"key\":\"function_word_miss\",\"category\":\"listening\",\"correction\":\"the\",\"note\":\"<IN ENGLISH: missed article>\"}]"
     }
     ```

**State D: Post-Practice Loop**
- `dict_next`: Loop back to **State A** (re-analyze level, apply threshold, generate new sentence).
- `nav_main`: Act exactly like the `/new` command. Use the `reset_context` tool with NO arguments (you MUST NOT provide a summary), then trigger `ielts-router` skill to show the main practice menu.

## 6. Hard Rules
1. **No Early Reveals**: NEVER show the English transcript on the first listen unless the user explicitly requests it or clicks `[😵 句子太难]`.
2. **Be Specific**: Diff every word. Do not just say "Good job" if they missed an `s`, an article, or a function word.
3. **Circuit Breaker**: If their accuracy drops below 40% on a sentence, you MUST immediately drop down one tier in the Scaling Table for the next sentence. Do not let them get frustrated.
4. **Natural Chat Tone**: Keep the teaching voice supportive, natural, and conversational — not robotic or overly terse.
5. **Post-Sentence Choice**: After every sentence, always use inline keyboard choices in Chinese for the next action.
