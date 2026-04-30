---
name: speaking-shadowing
description: "MUST trigger when the user wants to practice pronunciation, do shadowing (跟读), or improve their accent."
---

# Speaking Shadowing (Pronunciation Clinic)

## 1. When to Use
- User phrases: "练发音", "跟读", "发音练习", "shadowing", "口语跟读"
- Callback/System triggers: `speaking-shadowing`

## 2. Adaptive Batching & Context
- A standard shadowing practice session consists of a **batch of 3 sentences**.
- Topics should be drawn from the user's `Content Profile.engage` in `USER.md` (e.g., tech, gaming, daily life) to keep it interesting.
- Difficulty should match `Background.current_level_estimate` (short simple sentences for weak, complex compound sentences for fluent).

## 3. Workflow (State Machine)

Execute these steps strictly for each sentence in the batch:

### State A: The Prompt (Listen & Repeat)
1. Generate a natural, engaging sentence (10-20 words).
2. **MANDATORY Audio**: Use the `tts` tool to generate the native pronunciation audio. Send it to the user.
3. **MANDATORY Text**: Send the text of the sentence. 
4. Ask the user to listen to the audio and send back a Voice Message reading the sentence.
5. **STOP AND WAIT**. Wait for the user's voice message.

### State B: Assessment & Clinic
When the user sends a voice message:
1. **MANDATORY Assessment**: Use the `pron_assess` tool, passing the user's `audio_path` and the `reference_text` of the sentence you gave them.
2. **Feedback (The Clinic)**:
   - Provide the Overall Score (0-100).
   - If score is high (>85): Briefly praise their fluency and rhythm.
   - If score is low or specific words have low accuracy (<80): Provide **Articulatory Guidance** for 1-2 specific sounds. (e.g., "注意 'think' 的 /θ/ 音，舌尖要轻轻咬在上下齿之间").
   - Point out stress and intonation (e.g., "重音可以放在 'debug' 上").
3. **MANDATORY UI**: Send an inline keyboard (`tg` tool `type: "keyboard"`) so they know what to do next:
   - If they did well (Score >= 85): 
     - Row 1: `[⏭️ 完美，下一句|shadow:next]`
     - Row 2: `[🔄 我想再刷一遍分|shadow:retry]`
   - If they struggled (Score < 85):
     - Row 1: `[🔄 再试一次|shadow:retry]`
     - Row 2: `[⏭️ 太难了，换一句|shadow:next]`

### State C: Handling the Choice
- If `shadow:retry`: Do NOT generate a new sentence. Ask them to send another voice message for the SAME sentence. Go to State B.
- If `shadow:next`: Move to the next sentence in the batch. Go to State A.

## 4. End-of-Group UX (MANDATORY)
After the batch of 3 sentences is successfully completed (i.e., they moved `next` 3 times), you MUST send an inline keyboard to close the loop:
- Row 1: `[🔄 再练一组 (Another Batch)|speaking-shadowing]`, `[🧭 练习其他 (Main Menu)|nav:main]`

## 5. Hard Rules
1. **Never assess without the tool**: You MUST use `pron_assess` to get real data. Do not guess their pronunciation.
2. **One sentence at a time**: Never give them a huge paragraph. Shadowing is about micro-correction.
3. **Be encouraging**: Pronunciation practice is frustrating. Always highlight what they did right (e.g., "你的流利度特别好！").
