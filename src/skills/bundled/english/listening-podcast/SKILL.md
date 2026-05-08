---
name: listening-podcast
description: "Extensive listening practice for grasping the main idea, not dictation. Trigger for '泛听', 'listen to a podcast', 'news', 'extensive listening'."
---

# Listening Podcast (Extensive & Gist)

## 1. When to Use
- User phrases: "泛听", "listen to a podcast", "news", "extensive listening"
- Callback/System triggers: `listening-podcast`

## 2. Adaptive Scaling (CRITICAL Constraint)
Read the user's listening level from `MEMORY.md`.
- **Beginner (< 5.0)**: 30-40 seconds audio. Clear context (e.g., daily life).
- **Intermediate (5.0-6.0)**: 1 minute audio. Light academic or news context.
- **Advanced (6.5+)**: 1.5-2 minutes. **MUST inject 10-15% spoken fillers ("um", "you know")** and use non-standard accents (e.g., `en-GB`, `en-AU`) to simulate real-world noise.

## 3. Workflow (State Machine - STRICT EXECUTION)
You must follow these steps strictly to prevent hallucinations.

**CRITICAL TTS RULE**: The `tts` tool MUST ONLY be used to generate the target English practice audio. NEVER use the `tts` tool to speak conversational fillers. Use `tg_msg(type=text)` for chat.


### State A: Prepare & Deliver (Listen)
1. **Generate Content**: Create a podcast script matching the Scaling Table above.
2. **Generate Audio**: Use the `tts` tool to generate the audio. Send it via `tg_msg(type=voice)`. (DO NOT generate TTS for your own conversational replies).
3. **Send Instruction (Same Turn)**: Use `tg_msg(type=keyboard)` along with the voice message. 
   - **Text**: "🎧 听听这段播客。不用抓每一个字，**你觉得他最想表达的核心观点是什么？** (可以用中文回答)\n\n实在听不出可以点开看原文：<tg-spoiler>[Insert original English script here]</tg-spoiler>"
   - **Buttons**: `[["🐢 慢速播放|pod_slow", "😵 完全听不懂|pod_hard"]]`
4. **Initialize a per-round `ui_feedback` accumulator** (empty string). Every button tap below MUST append the exact button label so it can be persisted later as evidence — even if the learner eventually nails the gist.
5. **CRITICAL STOP**: End your turn immediately. WAIT for the user to type their answer or click a button.

### State B: Handle Feedback Buttons (Before typing)
If the user clicks a button:
- `pod_slow`:
  - **Append `🐢 慢速播放` to the round's `ui_feedback` accumulator** (mandatory — survives into State C's persist call so a "got the gist only after slow-down" attempt is not mistaken for native-speed comprehension).
  - Briefly acknowledge via `tg_msg(type=text)`, use `tts` with `rate="-10%"` on the SAME script, send new voice, and resend the instruction keyboard. Wait.
- `pod_hard`:
  - **STEP 1 — Negative Evidence Lock-in (MANDATORY, before generating the replacement).** A "completely lost" reaction at this scaling tier is the single highest-value signal `learner-state` can use to drop the listening level; it MUST hit the database before being replaced. Call `persist` immediately:

    ```json
    {
      "action": "practice",
      "skill_type": "listening.podcast",
      "session_id": "<session>",
      "completed": 0,
      "accuracy": 0,
      "prompt": "<the original English script that was abandoned>",
      "response": "",
      "feedback": "Learner tapped '完全听不懂' before answering. Treat as strong negative evidence at the current scaling tier.",
      "audio_path": "<tts file path of the abandoned audio>",
      "ui_feedback": "😵 完全听不懂",
      "section": "listening",
      "domain": "listening",
      "load_score": 0,
      "minutes": 0,
      "mode": "study",
      "metadata": "{\"abandoned_reason\":\"too_hard\",\"scaling_tier\":\"<beginner|intermediate|advanced>\",\"script_seconds\":<approx>}"
    }
    ```

    After `persist` returns, **reset the round** — start a fresh `ui_feedback` accumulator for the next clip.

  - **STEP 2 — Replacement.** Acknowledge naturally via `tg_msg(type=text)`. Explain the background context briefly in Chinese, generate a NEW significantly shorter/simpler script via `tts`, and go back to **State A**.

### State C: Evaluation & Data Update (User types the answer)
When the user submits their gist summary:
1. **Evaluate**: Do NOT correct minor grammar or spelling in their answer. Focus ONLY on comprehension. Did they catch the main idea? Did they get tricked by discourse markers like "However"?
2. **Execute Parallel Actions**: You MUST invoke BOTH `tg_msg` and `persist` tools **concurrently/in parallel**.
   - **Action 1 - Send Feedback (MANDATORY `tg_msg` tool)**: Use `tg_msg(type=keyboard)`.
     - **Text content**: Brief evaluation of their understanding in Chinese, pointing out the key phrase/turning point in the audio that carried the main idea.
     - **Buttons (MANDATORY EXACT LAYOUT)**: `[["🔄 再听一篇|pod_next", "🧭 练习其他|nav:main"]]`
   - **Action 2 - Data Update (MANDATORY `persist` tool)**: Log the practice data.
     ```json
     {
       "skill_type": "listening.podcast",
       "session_id": "<session>",
       "prompt": "<the podcast script>",
       "response": "<user's summary>",
       "accuracy": 0,
       "raw_score": <1 if gist caught, 0 if missed>,
       "max_score": 1,
       "feedback": "<IN ENGLISH: textual analysis of whether they grasped the gist and why>",
       "audio_path": "<tts file path>",
       "load_score": 2,
       "minutes": 1,
       "ui_feedback": "<comma-joined exact labels of every button tapped this round, e.g. '🐢 慢速播放' — empty string if no button was tapped>",
       "subcap_scores": "[{\"key\":\"listening.gist\",\"score\":5.0,\"evidence\":\"<IN ENGLISH: Understood main topic but missed the pivot>\"}]"
     }
     ```

     **`ui_feedback` is mandatory whenever any 🐢/😵 button was tapped this round**, even if the learner eventually summarised the gist correctly. Without it, `learner-state` will treat a "got it only after slow-down" pass as native-speed comprehension and over-promote the level. Abandoned-on-too-hard records are written by State B (`pod_hard`) — do NOT duplicate them here.

### State D: Post-Practice Loop
- `pod_next`: Loop back to **State A** (generate new topic).

## 4. Hard Rules
1. **NO Dictation**: NEVER ask the user to type exactly what they heard.
2. **No Early Reveals**: NEVER show the English transcript outside of the spoiler tag.
3. **No Conversational TTS**: The `tts` tool is ONLY for the practice material.
