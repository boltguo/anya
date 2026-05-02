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

> **STRICT PROHIBITION**: You are FORBIDDEN from using the `db` tool to write SQL. You MUST use the `persist` tool.

Call the `persist` tool natively with these JSON arguments:

```json
{
  "skill_type": "speaking.freetalk",
  "session_id": "<session>",
  "prompt": "<topic/question given>",
  "response": "<concatenated user responses>",
  "feedback": "<textual analysis of fluency, vocabulary, grammar>",
  "load_score": 2,
  "minutes": 3,
  "errors": "[{\"key\":\"filler_overuse\",\"category\":\"speaking\",\"original\":\"um...like...\",\"correction\":\"\",\"note\":\"填充词过多\"}]",
  "subcap_scores": "[{\"key\":\"speaking.fluency\",\"score\":5.5,\"evidence\":\"中等停顿\"},{\"key\":\"speaking.lexical_variety\",\"score\":5.0,\"evidence\":\"基础词汇为主\"}]"
}
```

Error keys: `filler_overuse`, `verb_form_error`, `l1_transfer`, `vocabulary_repetition`, `register_mismatch` (record only 1-2 errors you gave stealth feedback on)

## 6. Hard Rules
1. **The 'I'm Stuck' Protocol**: If the user uses native language or hits SOS, you MUST NOT grade them. Provide a word bank immediately.
2. **Fluency over Accuracy**: Keep the conversation flowing.
