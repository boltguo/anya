# Note-Taking Mode — Information Anchor Training

## Pedagogical Foundation

- **Ericsson Deliberate Practice**: Structured note-taking with immediate feedback on completeness
- **Cognitive Load Management**: 30-second segments prevent overload while building capacity
- **PRD §8.3.3**: Addresses "边听边记稳定性" — the ability to simultaneously listen and note key points

## When to Use

- `listening:notetaking` callback
- Auto-suggested when `note_taking_breakdown` appears in recent errors
- Best for band 5.5+ learners who can decode but lose information during note-taking

## Load Score: 3

## Protocol

### S3 — Material Preparation

Generate or select a 90-180 second academic lecture segment:
- Topic from learner interests + IELTS academic themes
- 5-8 clear information anchors (key facts, numbers, names, conclusions)
- Natural pace (no slowing)

Prepare a scoring rubric with the information anchors:

```json
{
  "anchors": [
    {"content": "The study was conducted in 2019", "type": "fact", "difficulty": "easy"},
    {"content": "Three main factors were identified", "type": "structure", "difficulty": "medium"},
    {"content": "Participants showed 40% improvement", "type": "data", "difficulty": "medium"},
    {"content": "The researcher concluded that environment matters more than genetics", "type": "conclusion", "difficulty": "hard"}
  ]
}
```

### S4 — Segmented Listening

Play the lecture in 30-second segments. After each segment:

```
tg(type:"force_reply", text:"⏸️ 写下你刚才听到的关键信息（中英文都可以）")
```

Wait for response. Continue to next segment.

Repeat for 3-6 segments (covering the full lecture).

### S5 — Anchor Scoring

Compare the learner's notes against the information anchors:

```
📋 信息锚点评分:

  ✅ 研究时间 (2019) — 正确捕获
  ✅ 三个主要因素 — 正确捕获
  ⚠️ 40% 改善 — 写成了 "大幅改善"（细节丢失）
  ❌ 环境 vs 基因的结论 — 完全遗漏

  得分: 5/8 锚点 (62.5%)
```

### S6 — Error Diagnosis

Classify each missed anchor:

| Missed Anchor | Possible Cause | Taxonomy Key |
|---|---|---|
| Failed to hear the word/phrase | Connected speech issue | `connected_speech_fail` |
| Heard but didn't understand | Academic vocabulary gap | (mark for vocab) |
| Understood but was still writing previous note | Note-taking overload | `note_taking_breakdown` |
| Heard and understood but forgot before writing | Working memory strain | `note_taking_breakdown` |
| Missed because focusing on wrong detail | Prioritization error | `note_taking_breakdown` |

### S7 — Strategy Coaching

Based on the error pattern, teach ONE note-taking strategy:

1. **Abbreviation system**: numbers, arrows, symbols
2. **Mind-map style**: central topic → branches
3. **Signal word listening**: "First... Second... In conclusion..."
4. **Selective attention**: Only note names, numbers, and conclusions — skip obvious filler

### S8 — Micro Drill (Forced Re-listen)

Replay the segment with the most missed anchors:

```
tg(type:"force_reply", text:"🔄 再听一次这个片段，这次只记 {{focus_anchor_type}} 类信息")
```

### S9 — Full Re-listen

Play the entire lecture one more time:

```
tg(type:"force_reply", text:"🔄 完整再听一遍，用今天学的策略重新记笔记")
```

Compare with first attempt. Celebrate improvement.

### S10 — Record

Use shared S10. Additional fields:
- `subcap_key: listening.note_taking_stability`
- Evidence: anchor hit rate percentage
- Record `note_taking_breakdown` errors for missed anchors

## Exit Keyboard

```
[KEYBOARD:
😰 太难了=feedback_too_hard | 👌 刚好=feedback_just_right | 🥱 太简单=feedback_too_easy
🔁 再来一题=listening:notetaking | 🏠 返回=practice
]
```
