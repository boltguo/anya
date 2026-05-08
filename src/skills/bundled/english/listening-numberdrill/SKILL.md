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

**CRITICAL TTS RULE**: The `tts` tool MUST ONLY be used to generate the target English practice sentence. NEVER use the `tts` tool to speak conversational fillers. Use the `tg_msg(type=text)` tool if you need to speak to the user.


### State A: Prepare & Deliver (Listen)
1. **Randomize**: Silently pick ONE Trap category from above. Generate a short sentence containing that trap (e.g., "Her phone number is 07700 900461", or "My name is Sarah, that's S-A-R-A-H").
2. **Generate Audio**: Use `tts` tool to get the audio. Use a British voice by default (`en-GB-SoniaNeural` or `en-GB-RyanNeural`). Send it via `tg_msg(type=voice)`. (DO NOT generate TTS for your own conversational replies).
3. **Send Instruction (Same Turn)**: Use `tg_msg(type=keyboard)` along with the voice message. 
   - **Text**: "🎧 听录音，把听到的**数字、时间、或拼写的单词**打出来。\n\n实在听不出可以点开看原文：<tg-spoiler>[Insert original English text here]</tg-spoiler>"
   - **Buttons**: `[["🐢 慢速播放|num_slow", "😵 太难了，换简单点|num_hard"]]`
4. **Initialize a per-round `ui_feedback` accumulator** (empty string). Every button tap below MUST append the exact button label so it can be persisted later as evidence — even if the learner eventually nails the trap.
5. **CRITICAL STOP**: End your turn immediately. WAIT for the user to type their answer or click a button.

### State B: Handle Feedback Buttons (Before typing)
If the user clicks a button:
- `num_slow`:
  - **Append `🐢 慢速播放` to the round's `ui_feedback` accumulator** (mandatory — survives into State C's persist call so a "passed only after slow-down" attempt is not mistaken for clean comprehension).
  - Briefly acknowledge via `tg_msg(type=text)`, use `tts` with `rate="-10%"` on the SAME sentence, send new voice, and resend the instruction keyboard. Wait.
- `num_hard`:
  - **STEP 1 — Negative Evidence Lock-in (MANDATORY, before generating the replacement).** The trap the learner abandoned is a high-value signal; it MUST hit the database before being thrown away. Call `persist` immediately:

    ```json
    {
      "action": "practice",
      "skill_type": "listening.numberdrill",
      "session_id": "<session>",
      "completed": 0,
      "accuracy": 0,
      "prompt": "<the sentence that was just too hard>",
      "response": "",
      "feedback": "Learner tapped '太难了' before answering. Trap category was <e.g. teen-vs-ty>; treat as negative evidence at this difficulty.",
      "audio_path": "<tts file path of the abandoned sentence>",
      "ui_feedback": "😵 太难了",
      "section": "listening",
      "domain": "listening",
      "load_score": 0,
      "minutes": 0,
      "mode": "study",
      "metadata": "{\"abandoned_reason\":\"too_hard\",\"trap_category\":\"<category>\"}"
    }
    ```

    After `persist` returns, **reset the round** — start a fresh `ui_feedback` accumulator for the next sentence.

  - **STEP 2 — Replacement.** Acknowledge naturally via `tg_msg(type=text)`, explain the trap, generate a NEW simpler sentence via `tts`, and go back to **State A**.

### State C: Evaluation & Data Update (User types the answer)
When the user submits their dictated text:
1. **Evaluate**: Compare specifically against the trap. Did they miss "double", confuse 13/30, or misspell the name?
2. **Execute Parallel Actions**: You MUST invoke BOTH `tg_msg` and `persist` tools **concurrently/in parallel**.
   - **Action 1 - Send Feedback (MANDATORY `tg_msg` tool)**: Use `tg_msg(type=keyboard)`.
     - **Text content**: Correct full sentence, concise Chinese translation, and **specific error analysis** (point out exactly why they missed the trap, e.g., "thirty 的重音在前面，thirteen 在后面").
     - **Buttons (MANDATORY EXACT LAYOUT)**: `[["🔄 再来一个|num_next", "🧭 练习其他|nav:main"]]`
   - **Action 2 - Data Update (MANDATORY `persist` tool)**: Log the practice data.
     ```json
     {
       "skill_type": "listening.numberdrill",
       "session_id": "<session>",
       "prompt": "<correct sentence>",
       "response": "<user's typed text>",
       "accuracy": <correct_words / total_words>,
       "raw_score": <correct count>,
       "max_score": <total words>,
       "feedback": "<IN ENGLISH: textual analysis of the trap miss>",
       "audio_path": "<tts file path>",
       "load_score": 1,
       "minutes": 1,
       "ui_feedback": "<comma-joined exact labels of every button tapped this round, e.g. '🐢 慢速播放' — empty string if no button was tapped>",
       "errors": "[{\"key\":\"number_confusion\",\"category\":\"listening\",\"correction\":\"30\",\"note\":\"<IN ENGLISH: note about teen/ty confusion>\"}]"
     }
     ```
     Error keys: `number_confusion`, `spelling_error`, `function_word_miss`

     **`ui_feedback` is mandatory whenever any 🐢/😵 button was tapped this round**, even if the learner ends up scoring 100%. Without it, `learner-state` will treat a "had to slow down to catch the digits" pass as proof of mastery and over-promote the level. Abandoned-on-too-hard records are written by State B (`num_hard`) — do NOT duplicate them here.

### State D: Post-Practice Loop
- `num_next`: Loop back to **State A** (pick a new random trap, generate new sentence).

## 4. Hard Rules
1. **No Early Reveals**: NEVER show the English transcript on the first listen unless they use the spoiler tag.
2. **No Conversational TTS**: The `tts` tool is ONLY for the practice material.
