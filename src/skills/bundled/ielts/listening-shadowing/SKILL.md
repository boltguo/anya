---
name: listening-shadowing
description: "Clip-level listening shadow — rhythm + keyword retention + prosody capture."
---

# Listening Shadowing

Different from `speaking-shadowing` (phoneme accuracy). Here the goal is to stay with the speaker — decoding speed and rhythm, not isolated phonemes.

## 1. When to Use
- User phrases: "听力跟读", "影子跟读", "shadowing"
- Callback/System triggers: `listening-shadowing`

## 2. Adaptive Scaling (CRITICAL Constraint)
Before generating ANY text, read the user's current listening level from `USER.md` (or `MEMORY.md`).

| User Level (Band) | Word Count | Syntactic Complexity | Audio Speed | Accent Variation |
| :--- | :--- | :--- | :--- | :--- |
| **Beginner** (< 5.0) | **15-20 words** | Simple sentences | Slower (-10%) | Standard US/UK only |
| **Intermediate** (5.0-6.0)| **25-35 words** | Natural flow, some linking | Normal speed | Standard US/UK only |
| **Advanced** (6.5+) | **40-50 words** | Fast, heavy connected speech | Normal speed | Inject non-standard accents (AU, IN) |

## 3. Workflow (State Machine)

A standard practice session is exactly **1 Batch = 2 Shadowing Clips**.

### State 0: Clean Slate (Run ONCE per batch)
- **MANDATORY**: Call the `reset_context` tool immediately when this skill starts. Pass a summary like: `"Starting listening shadowing batch. User level is [insert level]."`

### State A: The Prompt (Listen & Shadow)
Execute for the current clip in the batch:
1. **Generate**: Create a passage matching the Scaling Table above. Focus on topics from `Content Profile.engage`.
2. **MANDATORY Audio**: Use the `tts` tool to generate the audio. Send it to the user via the `tg` tool (type: `voice`).
3. **MANDATORY Hidden Text**: Do NOT send the English text. 
4. **Instruction**: Send a text message: "🎧 先盲听一遍，然后直接按住录音，**一边听一边跟我读（影子跟读）**。"
5. **STOP AND WAIT**. Wait for the user to send their voice message.

### State B: Evaluation & Clinic
When the user sends their voice message:
1. **MANDATORY Assessment**: Use the `pron_assess` tool, passing the user's `audio_path` and the `reference_text` of the passage you generated.
2. **Feedback (The Clinic)**:
   - **Reveal**: Provide the original English text and Chinese translation.
   - **Fluency & Rhythm**: Provide their Fluency score (0-100). Did they keep up with the speaker?
   - **Connected Speech**: Point out 1-2 places where native speakers link words (连读/吞音) that the user missed or stumbled on.
3. **Dynamic Adaptation**: 
   - If Fluency < 60: Decrease difficulty/length for the next clip.
   - If Fluency > 85: Increase difficulty/speed for the next clip.
4. **MANDATORY UI**: Send an inline keyboard (`tg` tool `type: "keyboard"`):
   - Row 1: `[🔄 再试一次 (Retry)|shadow:retry]`, `[⏭️ 下一段 (Next)|shadow:next]`

### State C: Handling UI Options
If the user clicks a button:
- `shadow:retry`: Do not generate a new clip. Ask them to record themselves shadowing the SAME clip again. Go back to State B.
- `shadow:next`: 
  - If this was clip 1, generate the next clip and go to **State A**.
  - If this was clip 2 (batch complete), go to **State D**.

### State D: End-of-Group UX (MANDATORY)
After 2 clips are complete, you MUST send an inline keyboard to close the loop:
- Row 1: `[🔄 再练一组 (Another Batch)|listening-shadowing]`, `[🧭 练习其他 (Main Menu)|nav:main]`

## 4. Persist (Data Contract)
Use the `db` tool to log data into `study.db`:
- **Table `samples`**: Insert a row with `skill_type="listening.shadowing"`, `load_score=2`. Log the fluency and accuracy percentage in `feedback`.
- **Table `errors`**: For major rhythm breaks, insert a row with `error_key` like `connected_speech_fail`.

## 5. Hard Rules
1. **No Early Reveals**: NEVER show the English transcript before they attempt the shadowing.
2. **Score rhythm, not just phonemes**: Emphasize pacing and mimicking the speaker's intonation over perfect individual sounds.
3. **Audio Mandatory**: You MUST generate TTS audio for every clip.
4. **Batch Limits**: Strictly enforce the 2-clip limit before offering the end-of-group menu to prevent fatigue.
