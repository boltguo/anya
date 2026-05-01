---
name: reading-deepdive
description: "MUST trigger for intensive reading comprehension. Focuses on deep syntax analysis and logic mapping without time limits. Trigger for 'deep reading', 'analyze article', '精读'."
---

# Reading Deep Dive (Syntax & Logic)

## 1. When to Use (Trigger Contexts)
- User phrases: "精读", "read carefully", "deep reading", "analyze this"
- Callback/System triggers: `reading-deepdive`

## 2. Adaptive Scaling (CRITICAL Constraint)
Read the user's reading level from `MEMORY.md`.
- **Beginner (< 5.0)**: 100-150 words. Simple narrative or descriptive text.
- **Intermediate (5.0-6.0)**: 150-200 words. Argumentative text with clear structure.
- **Advanced (6.5+)**: 200-300 words. Dense academic text with inverted sentences and heavy nominalization (e.g., Scientific American, Economist).

## 3. Workflow (Step-by-Step)
Default session is **1 text passage**.

**Step 1: Text Delivery & UI Setup**
- Send the English text.
- **Tone rule:** "慢慢读，不用急。读完用一句话告诉我这段话的核心逻辑是什么？"
- **MANDATORY UI**: Send an inline keyboard:
  - Row 1: `[😵 句子太绕]`, `[📚 生词太多]`
  - Row 2: `[💡 提示一下结构]`

**Step 2: Handle Feedback (If clicked)**
- `[😵 句子太绕]`: Identify the longest "killer sentence" and break it down (Subject -> Verb -> Object).
- `[📚 生词太多]`: Provide a mini-glossary of the 3 hardest words.
- `[💡 提示一下结构]`: Provide a 3-bullet-point structural map in Chinese.
- Log button usage to `ui_feedback`.

**Step 3: Deep Dive Evaluation**
- Once the user answers, evaluate their grasp of the logic.
- **Vocabulary Harvest**: Automatically extract 2-3 high-value collocations from the text, explain them, and add them to the SRS queue.

## 4. End-of-Group UX (MANDATORY)
After the review, you MUST send an inline keyboard in Chinese:
- Row 1: `[🔄 再读一篇]`, `[🧭 练习其他]`

## 5. Persist (Data Contract)

**Follow `support/ielts-data-contract/references/post-practice-protocol.md` for all writes.** Do NOT update MEMORY.md — `learner-state` skill handles that.

1. **`samples`** row:
   - `skill_type = 'reading.deepdive'`
   - `prompt` = the full passage text
   - `raw_content` = the user's analysis/answer
   - `accuracy = NULL` (qualitative assessment)
   - `load_score = 2`
   - `ui_feedback` = clicked buttons (e.g. `"句子太绕,生词太多"`)
   - `feedback` = JSON:
     ```json
     {"comprehension": "partial", "structure_grasped": true, "killer_sentence_helped": true, "harvested_words": ["fluctuate", "notwithstanding"], "session_notes": "长难句拆解后理解到位"}
     ```

2. **`errors`** — from `references/error-keys.md` (if applicable):
   - `inference_error`, `paraphrase_miss`, `keyword_matching_error`

3. **`subcap_scores`** — at least 1:
   - `reading.gist` — how well they grasped the core logic
   - `reading.syntax_parsing` — if killer sentence was involved

4. **Table `words`**: Insert harvested collocations into SRS queue

5. **`activity_log`** — upsert today

## 6. Hard Rules
1. **No Time Limits**: NEVER rush the user. This is an untimed drill.
2. **The "Why" Rule**: Do not just translate sentences. Explain *how* the grammar holds the sentence together.
