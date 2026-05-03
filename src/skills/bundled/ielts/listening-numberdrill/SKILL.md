---
name: listening-numberdrill
description: "Drill numbers, dates, times, and spelling. Trigger for number, spelling, or listening-numberdrill."
---

# Listening NumberDrill

Tiny drill, disproportionate payoff. Targets Section 1 "easy marks" (13 vs 30, double-0, spelling).

## 1. When to Use
- User phrases: "数字", "日期", "拼写", "number", "spelling"
- Callback/System triggers: `listening-numberdrill`
- Diagnostic triggers: Recent `number_confusion` or `spelling_error`.

## 2. Traps (Randomly pick ONE per sentence)
- **13/30, 14/40** (-teen vs -ty stress)
- **Phone / Account** ("double-0", "triple-7")
- **Dates / Times** (GB vs US format, quarter past)
- **Currencies / Decimals** ("point", pounds, dollars)
- **Name Spellings** (Double letters, confusing vowels like A/E/I)

## 3. Workflow (State Machine - STRICT EXECUTION)
You must follow these steps strictly to prevent hallucinations and ensure a standard procedure.

**CRITICAL TTS RULE**: The `tts` tool MUST ONLY be used to generate the target English practice sentence. NEVER use the `tts` tool to speak conversational fillers. Use the `tg(type=text)` tool if you need to speak to the user.

### State 0: Clean Slate (Run ONCE at start)
- **MANDATORY**: Call the `reset_context` tool immediately when this skill starts. Pass a summary like: `"Starting listening number drill."`

### State A: Prepare & Deliver (Listen)
1. **Randomize**: Silently pick ONE Trap category from above. Generate a short sentence containing that trap (e.g., "Her phone number is 07700 900461", or "My name is Sarah, that's S-A-R-A-H").
2. **Generate Audio**: Use `tts` tool to get the audio. Use a British voice by default (`en-GB-SoniaNeural` or `en-GB-RyanNeural`). Send it via `tg(type=voice)`. (DO NOT generate TTS for your own conversational replies).
3. **Send Instruction (Same Turn)**: Use `tg(type=keyboard)` along with the voice message. 
   - **Text**: "🎧 听录音，把听到的**数字、时间、或拼写的单词**打出来。\n\n实在听不出可以点开看原文：<tg-spoiler>[Insert original English text here]</tg-spoiler>"
   - **Buttons**: `[["🐢 慢速播放|num_slow", "😵 太难了，换简单点|num_hard"]]`
4. **CRITICAL STOP**: End your turn immediately. WAIT for the user to type their answer or click a button.

### State B: Handle Feedback Buttons (Before typing)
If the user clicks a button:
- `num_slow`: Briefly acknowledge via `tg(type=text)`, use `tts` with `rate="-10%"` on the SAME sentence, send new voice, and resend the instruction keyboard. Wait.
- `num_hard`: Acknowledge naturally via `tg(type=text)`, explain the trap, generate a NEW simpler sentence via `tts`, and go back to **State A**.

### State C: Evaluation & Data Update (User types the answer)
When the user submits their dictated text:
1. **Evaluate**: Compare specifically against the trap. Did they miss "double", confuse 13/30, or misspell the name?
2. **Execute Parallel Actions**: You MUST invoke BOTH `tg` and `persist` tools **concurrently/in parallel**.
   - **Action 1 - Send Feedback (MANDATORY `tg` tool)**: Use `tg(type=keyboard)`.
     - **Text content**: Correct full sentence, concise Chinese translation, and **specific error analysis** (point out exactly why they missed the trap, e.g., "thirty 的重音在前面，thirteen 在后面").
     - **Buttons (MANDATORY EXACT LAYOUT)**: `[["🔄 再来一个|num_next", "🧭 练习其他|nav_main"]]`
   - **Action 2 - Data Update (MANDATORY `persist` tool)**: Log the practice data.
     ```json
     {
       "skill_type": "listening.numberdrill",
       "session_id": "<session>",
       "prompt": "<correct sentence>",
       "raw_content": "<user's typed text>",
       "accuracy": <correct_words / total_words>,
       "raw_score": <correct count>,
       "max_score": <total words>,
       "feedback": "<IN ENGLISH: textual analysis of the trap miss>",
       "audio_path": "<tts file path>",
       "load_score": 1,
       "minutes": 1,
       "errors": "[{\"key\":\"number_confusion\",\"category\":\"listening\",\"correction\":\"30\",\"note\":\"<IN ENGLISH: note about teen/ty confusion>\"}]"
     }
     ```
     Error keys: `number_confusion`, `spelling_error`, `function_word_miss`

### State D: Post-Practice Loop
- `num_next`: Loop back to **State A** (pick a new random trap, generate new sentence).
- `nav_main`: Act exactly like the `/new` command. Use the `reset_context` tool with NO arguments (you MUST NOT provide a summary), then trigger `ielts-router` skill to show the main practice menu.

## 4. Hard Rules
1. **No Early Reveals**: NEVER show the English transcript on the first listen unless they use the spoiler tag.
2. **No Conversational TTS**: The `tts` tool is ONLY for the practice material.
