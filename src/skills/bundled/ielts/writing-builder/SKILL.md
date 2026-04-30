---
name: writing-builder
description: "MUST trigger when the user wants to practice basic writing mechanics, building sentences, grammar drills, or writing short paragraphs from outlines."
---

# Writing Builder (Micro-level Syntax Gym)

## 1. When to Use (Trigger Contexts)
- User phrases: "造句", "grammar drill", "build sentences", "练习写长句"
- Callback/System triggers: `writing-builder`

## 2. Adaptive Scaling (CRITICAL Constraint)
Read the user's writing level from `MEMORY.md`.
- **Beginner (< 5.0)**: Translate simple SVO sentences or combine 2 short sentences using "and/but".
- **Intermediate (5.0-6.0)**: Use specific conjunctions (Although, Despite) or relative clauses (which, who).
- **Advanced (6.5+)**: Paraphrase a simple sentence into an advanced academic structure (e.g., Inversion, Participle clauses, Nominalization).

## 3. Workflow (Step-by-Step)
Default session is **3 micro-tasks**.

**Step 1: Challenge Delivery & UI Setup**
- Send the micro-task (e.g., "用 'Despite' 和 'fluctuate' 把这两句话连起来...").
- **MANDATORY UI**: Send an inline keyboard:
  - Row 1: `[🆘 我卡壳了 (SOS)]`, `[💡 换个简单的]`

**Step 2: Handle Feedback (If clicked)**
- `[🆘 我卡壳了 (SOS)]`: Give them a sentence starter (e.g., "你可以这样开头：Despite the fact that...").
- `[💡 换个简单的]`: Drop the grammatical requirement and ask for a simpler version.
- Log button usage to `ui_feedback`.

**Step 3: Evaluation & Native Polish**
- Evaluate their sentence strictly on grammar and cohesion.
- **MUST** provide a "Native Polish" version, explaining exactly why your version flows better.

## 4. End-of-Group UX (MANDATORY)
After 3 tasks, you MUST send an inline keyboard in Chinese:
- Row 1: `[🔄 再来一组]`, `[🧭 练习其他]`

## 5. Persist (Data Contract)
- **Table `samples`**: `skill_type="writing.builder"`. Save clicked buttons to `ui_feedback`.
- **Table `errors`**: Log grammar mistakes.

## 6. Hard Rules
1. **High Intensity**: Keep instructions punchy.
2. **Always Provide Polish**: Never just say "Correct". Always show a slightly better way to write it.
