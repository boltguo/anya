---
name: speaking-freetalk
description: "MUST trigger for conversational practice, free-flowing speaking, or impromptu debates. Trigger for 'let's chat', 'freetalk', 'debate'."
---

# Speaking Freetalk (Impromptu & Debate)

## 1. When to Use (Trigger Contexts)
- User phrases: "Let's chat", "口语闲聊", "debate", "freetalk"
- Callback/System triggers: `speaking-freetalk`

## 2. Adaptive Scaling (CRITICAL Constraint)
Read the user's speaking level from `MEMORY.md`.
- **Beginner (< 5.0)**: Familiar topics (hobbies, food, daily routine).
- **Intermediate (5.0-6.0)**: Opinion-based topics (advantages/disadvantages of remote work).
- **Advanced (6.5+)**: Controversial or abstract topics (AI replacing jobs, ethical dilemmas).

## 3. Workflow (Step-by-Step)
Default session is **1 ongoing conversation (3-4 back-and-forth turns)**.

**Step 1: The Hook & UI Setup**
- Send a short audio (or text) introducing the topic with a thought-provoking question.
- **Reply rule (MANDATORY):** If sending audio, the text prompt MUST reply to the audio.
- **MANDATORY UI**: Send an inline keyboard:
  - Row 1: `[🆘 不知道怎么用英文说]`, `[🔄 换个话题]`

**Step 2: Handle Feedback (If clicked or typed native language)**
- `[🆘 不知道怎么用英文说]` or user types in Chinese: Enter **Scaffolding Mode**. Provide 3 useful verb phrases and a sentence starter. Tell them to try saying it again in English.
- `[🔄 换个话题]`: Acknowledge, generate a new topic, and restart.
- Log button usage to `ui_feedback`.

**Step 3: Active Listening & Stealth Feedback**
- Listen to their response. Push back gently to simulate a real debate ("I see your point, but what about...").
- **Stealth Feedback**: Do not stop the flow to correct every error. Mention 1 glaring error or suggest 1 advanced phrase *at the end* of your response.

## 4. End-of-Group UX (MANDATORY)
After 3-4 turns, wrap up the conversation and send an inline keyboard in Chinese:
- Row 1: `[🔄 换个话题再聊]`, `[🧭 练习其他]`

## 5. Persist (Data Contract)

**Follow `support/ielts-data-contract/references/post-practice-protocol.md` for all writes.** Do NOT update MEMORY.md — `learner-state` skill handles that.

1. **`samples`** row:
   - `skill_type = 'speaking.freetalk'`
   - `prompt` = the topic/question given
   - `raw_content` = concatenated user responses (or transcription if voice)
   - `accuracy = NULL` (freetalk is unscored)
   - `load_score = 2`
   - `feedback` = JSON:
     ```json
     {"turns": 4, "filler_count": 3, "self_corrections": 1, "scaffolding_used": false, "session_notes": "话题展开自然，词汇偏基础"}
     ```

2. **`errors`** — from `references/error-keys.md`:
   - `filler_overuse`, `verb_form_error`, `l1_transfer`, `vocabulary_repetition`, `register_mismatch`
   - Record only the 1-2 errors you gave stealth feedback on

3. **`subcap_scores`** — at least 2:
   - `speaking.fluency` — based on pauses, fillers, self-corrections
   - `speaking.lexical_variety` — based on vocabulary range
   - `speaking.interaction` — if applicable (debate/back-and-forth)

4. **`activity_log`** — upsert today

## 6. Hard Rules
1. **The 'I'm Stuck' Protocol**: If the user uses native language or hits SOS, you MUST NOT grade them. Provide a word bank immediately.
2. **Fluency over Accuracy**: Keep the conversation flowing.
