---
name: listening-shadowing
description: "Listening Rhythm Shadowing. Trigger when the user wants to practice listening comprehension by repeating short chunks. Focuses on rhythm, chunking, and catching fast speech, NOT isolated pronunciation."
---

# Listening Shadowing

Different from `speaking-shadowing` (phoneme accuracy). Here the goal is to stay with the speaker — decoding speed and rhythm, not isolated phonemes.

## 1. When to Use
- User phrases: "听力跟读", "影子跟读", "跟读", "shadowing"
- Callback/System triggers: `listening-shadowing`

## 2. Adaptive Scaling (CRITICAL Constraint)
**STOP AND READ MEMORY:** Before generating ANY text, you MUST read the user's current listening level from `USER.md` (or `MEMORY.md`). The system logs indicate difficulty was too high because the user's level wasn't strictly followed. Start easier if unsure.

| User Level (Band) | Length / Cognitive Chunks | Syntactic Complexity | Audio Speed | Accent Variation |
| :--- | :--- | :--- | :--- | :--- |
| **Beginner** (< 5.0) | **5-8 words** (1 chunk) | Simple SVO. Short sentences. | Slower (-10%) | Standard US/UK only |
| **Intermediate** (5.0-6.0)| **10-15 words** (2 chunks) | Natural flow, basic linking | Normal speed | Standard US/UK only |
| **Advanced** (6.5+) | **20-30 words** (3+ chunks) | Fast, heavy connected speech | Normal speed | Inject non-standard accents (AU, IN) |

## 3. Workflow (State Machine)

**CRITICAL TTS RULE**: The `tts` tool MUST ONLY be used to generate the target English practice sentence. NEVER use the `tts` tool to speak conversational fillers. Use the `tg(type=text)` tool if you need to speak to the user.

### State 0: Clean Slate (Run ONCE at start)
- **MANDATORY**: Call the `reset_context` tool immediately when this skill starts. Pass a summary like: `"Starting listening shadowing. User level is [insert level]."`

### State A: The Prompt (Listen & Shadow)
Execute for the current clip:
1. **Analyze & Generate**: Create a passage matching the Scaling Table above based on `MEMORY.md`.
2. **MANDATORY Audio**: Use the `tts` tool to generate the audio. Send it to the user via the `tg` tool (type: `voice`). (DO NOT generate TTS for your own conversational replies).
3. **MANDATORY Hidden Text & Keyboard**: Use the `tg` tool (type: `keyboard`) to send an instruction message along with the audio. 
   - **Instruction text**: "🎧 先盲听一遍，然后直接按住录音，**一边听一边跟我读（影子跟读）**。\n\n如果实在跟不上，可以点开看原文：<tg-spoiler>[Insert original English text here]</tg-spoiler>"
   - **Keyboard**: Provide options in case it's too fast. Row 1: `[["🐢 慢速播放|shadow_slow", "😵 太难了，降级|shadow_hard"]]`
4. **STOP AND WAIT**. Wait for the user to send their voice message or click a button.

### State A.1: Handle Feedback Buttons
If the user clicks a button before recording:
- `shadow_slow`: Acknowledge via `tg(type=text)`, generate the SAME text with `rate="-10%"` using TTS, send the new audio, and wait again.
- `shadow_hard`: Acknowledge via `tg(type=text)`, drop the difficulty/length, generate a NEW simpler clip, and go back to State A.

### State B: Evaluation & Clinic
When the user sends their voice message:
1. **MANDATORY Assessment**: Use the `pron_assess` tool, passing the user's `audio_path` and the `reference_text` of the passage you generated.
2. **Execute Parallel Actions**: You MUST invoke BOTH `tg` and `persist` tools **concurrently/in parallel**.
   - **Action 1 - Feedback (MANDATORY `tg` tool)**: Use `tg(type=keyboard)`.
     - **Reveal**: Provide the original English text and Chinese translation.
     - **Fluency & Rhythm**: Provide their Fluency score (0-100). Did they keep up with the speaker?
     - **Connected Speech**: Point out 1-2 places where native speakers link words (连读/吞音) that the user missed or stumbled on.
     - **Buttons (MANDATORY EXACT LAYOUT)**: 
       Row 1: `[["🔄 再来一句|shadow_next", "🧭 练习其他|nav_main"]]`
       Row 2: `[["🔁 刚才那段再试一次|shadow_retry"]]`
   - **Action 2 - Data Update (MANDATORY `persist` tool)**: Use the `persist` tool to save the practice data:
     ```json
     {
       "skill_type": "listening.shadowing",
       "session_id": "<session>",
       "prompt": "<correct sentence>",
       "raw_content": "<transcription from pron_assess>",
       "accuracy": <pron_assess accuracy score / 100>,
       "raw_score": <pron_assess fluency score>,
       "max_score": 100,
       "feedback": "<IN ENGLISH: fluency and rhythm feedback>",
       "audio_path": "<tts file path>",
       "load_score": 2,
       "minutes": 1
     }
     ```

### State C: Handling UI Options
If the user clicks a button:
- `shadow_retry`: Do not generate a new clip. Ask them to record themselves shadowing the SAME clip again. Go back to State B when they reply.
- `shadow_next`: Generate the next clip and go to **State A**.
- `nav_main`: Act exactly like the `/new` command. Use the `reset_context` tool with NO arguments (you MUST NOT provide a summary), and then immediately trigger the `ielts-router` skill to show the main practice menu.



## 4. Hard Rules
1. **No Early Reveals**: NEVER show the English transcript before they attempt the shadowing, unless they use the spoiler tag.
2. **Score rhythm, not just phonemes**: Emphasize pacing and mimicking the speaker's intonation over perfect individual sounds.
3. **Audio Mandatory**: You MUST generate TTS audio for every clip.
