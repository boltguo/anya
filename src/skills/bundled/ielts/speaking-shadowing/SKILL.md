---
name: speaking-shadowing
description: "Speaking Pronunciation Clinic. Trigger ONLY when the user explicitly wants to correct their pronunciation of specific sounds (e.g. /θ/, /r/), or do deep phoneme-level practice."
---

# Speaking Shadowing (Pronunciation Clinic)

## 1. When to Use
- User phrases: "练发音", "纠正口音", "怎么读", "pronunciation"
- Callback/System triggers: `speaking-shadowing`
- Note: DO NOT use this for "听力跟读" or general "shadowing". Use `listening-shadowing` instead.

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
3. **MANDATORY UI**: Send an inline keyboard (`tg` tool `type: "keyboard"`) with this EXACT LAYOUT so they know what to do next. DO NOT talk about "刷分" or use gaming terminology:
   - Row 1: `[["🔄 再来一句|shadow:next", "🧭 练习其他|nav:main"]]`
   - Row 2: `[["🔁 刚才那句再练一遍|shadow:retry"]]`

### State C: Handling the Choice
- If `shadow:retry`: Do NOT generate a new sentence. Ask them to send another voice message for the SAME sentence. Go to State B.
- If `shadow:next`: Move to the next sentence in the batch. Go to State A.

## 4. End-of-Group UX (MANDATORY)
After the batch of 3 sentences is successfully completed (i.e., they moved `next` 3 times), you MUST send an inline keyboard to close the loop:
- Row 1: `[🔄 再练一组 (Another Batch)|speaking-shadowing]`, `[🧭 练习其他 (Main Menu)|nav:main]`

## 5. Persist (Data Contract)

**Follow `support/ielts-data-contract/references/post-practice-protocol.md` for all writes.** Do NOT update MEMORY.md — `learner-state` skill handles that.

After the 3-sentence batch:

1. **`samples`** row:
   - `skill_type = 'speaking.shadowing'`
   - `prompt` = the current sentence
   - `raw_content` = pron_assess scores summary (e.g. `"S1:92, S2:78, S3:85"`)
   - `accuracy` = average pron score / 100 (e.g. 85/100 = 0.85)
   - `raw_score` = sentences scored ≥85, `max_score` = 3
   - `load_score = 2`
   - `feedback` = A concise but detailed textual analysis of this specific attempt. Write about what exactly the user missed, the root cause, and overall performance. Do NOT use JSON.
     Example: "The user struggled with relative clauses and vocabulary precision, but maintained good overall flow."

2. **`errors`** — from `references/error-keys.md`:
   - `pronunciation_error` — for specific sound patterns

3. **`subcap_scores`** — at least 1:
   - `speaking.pronunciation` — based on average pron_assess score

4. **`activity_log`** — upsert today

## 6. Hard Rules
1. **Never assess without the tool**: You MUST use `pron_assess` to get real data. Do not guess their pronunciation.
2. **One sentence at a time**: Never give them a huge paragraph. Shadowing is about micro-correction.
3. **Be encouraging**: Pronunciation practice is frustrating. Always highlight what they did right (e.g., "你的流利度特别好！").
