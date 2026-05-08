---
name: speaking-shadowing
description: "Speaking Pronunciation Clinic. Trigger ONLY when the user explicitly wants to correct their pronunciation of specific sounds (e.g. /θ/, /r/), or do deep phoneme-level practice."
---

# Speaking Shadowing (Pronunciation Clinic)

## 1. When to Use
- User phrases: "练发音", "纠正口音", "怎么读", "pronunciation"
- Callback/System triggers: `speaking-shadowing`
- Note: DO NOT use this for "听力跟读" or general "shadowing". Use `listening-shadowing` instead.

## 2. Adaptive Scaling
Read the user's speaking level from `MEMORY.md`.
- **Beginner (< 5.0)**: 5-8 words. Simple phonemes.
- **Intermediate (5.0-6.0)**: 10-15 words. Focus on linking, stress, and common traps (th/s, r/l).
- **Advanced (6.5+)**: 15-20 words. Fast connected speech, intonation, and rhythm.

## 3. Workflow (State Machine - STRICT EXECUTION)
You must follow these steps strictly to prevent hallucinations and ensure a standard procedure.

**CRITICAL TTS RULE**: The `tts` tool MUST ONLY be used to generate the target English practice audio. NEVER use the `tts` tool to speak conversational fillers. Use `tg_msg(type=text)` for chat.


### State A: Prepare & Deliver (Listen & Repeat)
1. **Generate Content**: Create a natural, engaging sentence matching the Scaling Table above.
2. **Generate Audio**: Use the `tts` tool to generate the native pronunciation audio. (Use Azure Neural voices).
3. **Execute Parallel UI Actions**: You MUST invoke the `tg_msg` tool multiple times concurrently to send the audio and instruction separately.
   - **Action 1 (Voice)**: `tg_msg(type="voice")` to send the generated audio file.
   - **Action 2 (Text & Buttons)**: `tg_msg(type="keyboard")` to send the instruction text.
     - **Text**: "🎧 先听示范，然后按住录音键**朗读原句**，我来帮你揪出发音细节。\n\n原文：<tg-spoiler>[Insert original English text here]</tg-spoiler>"
     - **Buttons**: `[["🐢 慢速示范|speak_slow", "😵 太长了，换短句|speak_hard"]]`
4. **CRITICAL STOP**: End your turn immediately. WAIT for the user to send their voice message or click a button.

### State B: Handle Feedback Buttons (Before recording)
If the user clicks a button:
- `speak_slow`: Briefly acknowledge via `tg_msg(type=text)`, use `tts` with `rate="-10%"` on the SAME sentence, send new voice, and resend the instruction keyboard. Wait.
- `speak_hard`: Acknowledge naturally via `tg_msg(type=text)`, generate a NEW shorter sentence via `tts`, and go back to **State A**.

### State C: Assessment & Clinic (User sends voice message)
When the user sends a voice message:
1. **MANDATORY Assessment**: Call the `pron_assess` tool, passing the user's `audio_path` and the `reference_text` (the correct sentence). Wait for the result.
2. **Execute Parallel Actions**: You MUST invoke BOTH `tg_msg` and `persist` tools **concurrently/in parallel**.
   - **Action 1 - Send Feedback (MANDATORY `tg_msg` tool)**: Use `tg_msg(type=keyboard)`.
     - **Text content**: Format the feedback strictly and cleanly using Markdown:
       1. **Score Board**: "🎯 **得分**：综合 88 | 准确 90 | 流利 85 | 韵律 82" (Must use these 4 metrics from Azure).
       2. **Diagnosis**: If the overall score is > 85, briefly praise them. If < 85, point out exactly which word failed in the Azure `words` array.
       3. **Articulatory Guidance (The Clinic)**: Provide precise, physical instructions for 1-2 specific sounds that had low accuracy. Example: "👉 **/θ/ 音纠正**：舌尖要轻轻咬在上下齿之间，让气流摩擦而出，不要发成 /s/。" Mention stress and intonation based on the prosody score. Keep it professional, concise, and structured with bullet points.
     - **Buttons (MANDATORY EXACT LAYOUT)**: `[["🔄 练下一句|speak_next", "🧭 练习其他|nav:main"], ["🔁 刚才那句再练一次|speak_retry"]]`
   - **Action 2 - Data Update (MANDATORY `persist` tool)**: Log the practice data.
     ```json
     {
       "skill_type": "speaking.shadowing",
       "session_id": "<session>",
       "prompt": "<correct sentence>",
       "response": "<transcription from pron_assess>",
       "accuracy": <pron_assess accuracy score / 100>,
       "raw_score": <pron_assess pron score>,
       "max_score": 100,
       "feedback": "<IN ENGLISH: textual analysis of specific phoneme or rhythm errors based on the 4 sub-scores>",
       "audio_path": "<tts file path>",
       "load_score": 2,
       "minutes": 1,
       "errors": "[{\"key\":\"pronunciation_error\",\"category\":\"speaking\",\"note\":\"<IN ENGLISH: specific phoneme error>\"}]",
       "subcap_scores": "[{\"key\":\"speaking.fluency\",\"score\":<fluency score/10>, \"evidence\":\"<IN ENGLISH: fluency justification>\"}, {\"key\":\"speaking.pronunciation\",\"score\":<accuracy score/10>}]"
     }
     ```

### State D: Handling the Choice
If the user clicks a button:
- `speak_retry`: Do NOT generate a new sentence. Briefly reply via `tg_msg(type=text)` asking them to record the SAME sentence again. Go to **State C** when they reply.
- `speak_next`: Generate the next sentence and go to **State A**.

## 4. Hard Rules
1. **Never assess without the tool**: You MUST use `pron_assess` to get real data. Do not guess their pronunciation.
2. **Reply Hygiene**: Send voice and instruction messages separately without using `reply_to`.
3. **No Batching**: Process exactly ONE sentence per cycle. Do not wait for 3 sentences to save data.
