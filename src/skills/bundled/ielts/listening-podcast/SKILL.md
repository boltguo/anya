---
name: listening-podcast
description: "MUST trigger for extensive listening practice where the goal is grasping the main idea, not dictation. Trigger for 'listen to a podcast', 'news', 'extensive listening'."
---

# Listening Podcast (Extensive & Gist)

## 1. When to Use (Trigger Contexts)
- User phrases: "泛听", "listen to a podcast", "news", "extensive listening"
- Callback/System triggers: `listening-podcast`

## 2. Adaptive Scaling (CRITICAL Constraint)
Read the user's listening level from `MEMORY.md`.
- **Beginner (< 5.0)**: 40-60 seconds audio. Clear context (e.g., daily life).
- **Intermediate (5.0-6.0)**: 1-1.5 minutes audio. Light academic or news context.
- **Advanced (6.5+)**: 1.5-2 minutes. **MUST inject 10-15% spoken fillers ("um", "you know")** and use non-standard accents (e.g., British, Australian) to simulate real-world noise.

## 3. Workflow (Step-by-Step)
Default session is **1 audio clip** followed by discussion.

**Step 1: Audio Delivery & UI Setup**
- Generate TTS for the selected script.
- Send the audio to the user.
- **Reply rule (MANDATORY):** Audio does NOT reply. The instruction message MUST reply to the audio.
- **Tone rule:** Sound like a friend sharing a podcast. "听听这段很有意思的播客。你觉得他最想表达的核心观点是什么？"
- **MANDATORY UI**: Send an inline keyboard:
  - Row 1: `[🐢 放慢一点]`, `[📖 看原文剧本]`
  - Row 2: `[😵 没听懂大意]`

**Step 2: Handle Feedback (If clicked)**
- `[🐢 放慢一点]`: Resend at -10% rate.
- `[📖 看原文剧本]`: Reveal the English transcript immediately.
- `[😵 没听懂大意]`: Give a 2-sentence summary in Chinese, and ask a simpler specific question.
- Log button usage to `ui_feedback` in `samples`.

**Step 3: Gist Evaluation & Discussion**
- Evaluate the user's response. Do NOT focus on grammar here; focus on comprehension.
- If they missed the gist, explain how discourse markers (e.g., "However", "Despite") shifted the meaning.

## 4. End-of-Group UX (MANDATORY)
After the discussion, you MUST send an inline keyboard in Chinese:
- Row 1: `[🔄 再听一篇]`, `[🧭 练习其他]`

## 5. Persist (Data Contract)

**Follow `support/ielts-data-contract/references/post-practice-protocol.md` for all writes.** Do NOT update MEMORY.md — `learner-state` skill handles that.

1. **`samples`** row:
   - `skill_type = 'listening.podcast'`
   - `prompt` = the podcast script/topic
   - `raw_content` = the user's gist response
   - `accuracy = NULL` (comprehension is qualitative)
   - `load_score = 2`
   - `audio_path` = TTS file path
   - `ui_feedback` = clicked buttons (e.g. `"slower,transcript"`)
   - `feedback` = JSON:
     ```json
     {"comprehension_accuracy": 0.8, "items": 3, "correct": 2, "main_idea_grasped": true, "session_notes": "细节题偏弱"}
     ```

2. **`subcap_scores`** — at least 1:
   - `listening.gist` — how well they grasped the main idea
   - `listening.detail` — if follow-up questions were asked

3. **`activity_log`** — upsert today

## 6. Hard Rules
1. **NO Dictation**: NEVER ask the user to type exactly what they heard.
2. **Reply Hygiene**: Instruction messages MUST reply to the corresponding audio.
3. **No Early Reveals**: Do not show the transcript unless `[📖 看原文剧本]` is clicked.
