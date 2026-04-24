# Speaking Exam — Full Workflow + Report

## S1 Context
Read USER (interests, target band, exam date), MEMORY (speaking band, pronunciation_weak, weak dims), material bank.

```
db name=study sql="SELECT prompt AS category, raw_content FROM samples WHERE skill_type='material_bank' ORDER BY created_at DESC LIMIT 20"
```

## S2 Part 1
- Pick a familiar-topic cluster (home/work/study/hobbies/food/travel) aligned with learner profile.
- Ask 4-5 Qs via `tts` (British examiner voice, default rate).
- Collect voice answers; `pron_assess` on the longest usable one.
- Keep follow-ups natural; don't over-scaffold.

## S3 Part 2
- Cue card: title + 3 bullets + "and explain why".
- Prefer a topic the learner has in material bank; else aligned to hobbies.
- `tg(type:"force_reply", text:"你有 1 分钟准备，准备好发语音。")`.
- Time the response. Target 1:30-2:00.
- Call `pron_assess`; record duration.

## S4 Part 3
Scale abstraction with band:
- < 5.5 → personal-extension
- 5.5-6.5 → societal / comparative
- 6.5+ → hypothetical / evaluative

Collect voice answers for each.

## S5 Self-prediction (before scoring)
```
tg(type:"force_reply", text:"你觉得自己这次 Overall 大概几分？（数字，比如 5.5）")
```
Store gap `abs(pred − actual)` — learner-state aggregates into `Metacognition.self_prediction_gap`.

## S6 Score + Report

```
📋 口语模考结果

| 维度 | 分数 | 证据 |
|---|---|---|
| Fluency & Coherence | {{fc}} | {{fc_evidence}} |
| Lexical Resource | {{lr}} | {{lr_evidence}} |
| Grammar Range & Accuracy | {{gra}} | {{gra_evidence}} |
| Pronunciation | {{pron}} | {{pron_evidence}} |
| **Overall** | **{{overall}}** | |

▍ Part 2 结构检查
  场景 {{s}} · 人物 {{c}} · 冲突 {{cf}} · 结束 {{r}} · 感受 {{f}}

▍ Top 2 提分点
  1. {{top_fix_1}}
  2. {{top_fix_2}}

▍ 自评差距
  你预估 {{pred}} ↔ 实际 {{overall}} (|Δ| = {{gap}})
```

## S7 Persist

- 1 `samples` row per part. Part 2/3 use `parent_sample_id = <Part1_id>`.
- Shared `session_id = 'speaking-exam-<ts>'`.
- `subcap_scores`: `speaking.fluency_pauses`, `.pronunciation_intelligibility`, `.part2_structure`, `.part3_abstraction`, `.lexical_variety`, `.grammar_accuracy`, `.interaction`.
- `errors` with canonical keys + root cause.

## S8 Hand-off

```
tg(type:"keyboard", text:"下一步？", buttons:"[[\"🔍 讲解扣分点|speaking-explain\"],[\"🎯 针对 {{top_fix_1}}|{{drill_callback}}\"],[\"🏠 返回|nav:main\"]]")
```
