# Phase 4 — Baseline Assessment (Two-Phase Adaptive Placement)

No choice. Run it directly after the profile is set.

Send a casual transition (normal text reply):

> 好了，档案搞完了 ✅ 现在来做个小测，5-8 分钟～
> 帮我摸清楚你的起点，这样后面出的题才准。

## Phase A: Quick Probe (5-8 minutes)

Five independent skill tests, each producing a separate band estimate.

### Step 1 — Speaking Quick Test (90s)

3 Part 1 simple questions via force_reply:

```bash
[native] adapter.force-reply --text "Quick speaking test! Answer in English:\n1. What do you do for work or study?\n2. What do you enjoy doing in your free time?\n3. Describe your hometown in one sentence."
```

Optional: if learner sends voice → `pron_assess(audio_path, reference_text)` for pronunciation baseline.

Evaluate: vocabulary range, grammar accuracy, answer completeness.

### Step 2 — Listening Quick Test (90s)

**2 sentence dictations:**

```
tts(text:"<sentence 1, 8-12 words>")
```

```
tg(type:"force_reply", text:"写出你听到的句子")
```

Repeat for sentence 2.

**1 short clip quiz:**

```
tts(text:"<30s short audio>")
```

```
tg(type:"quiz", text:"What was the main point?", options:[...], correct:N)
```

### Step 3 — Reading Quick Test (2 min)

150-word passage + 3 mixed questions (T/F/NG + fill-in + MC):

```
tg(type:"force_reply", text:"<passage + questions>\n\n回复你的答案")
```

### Step 4 — Writing Quick Test (2 min)

```bash
[native] adapter.force-reply --text "用英文写一段话 (60-90 词):\n\n<topic based on USER.md interests>\n\n比如介绍你最喜欢的 <hobby>，或者说说你对 <topic> 的看法"
```

Evaluate with 4D scoring: Task Response, Coherence, Lexical, Grammar.

### Step 5 — Grammar Adaptive Quiz (2 min)

6-10 quiz polls with dynamic difficulty:

- Start at B1 level
- Correct → next question harder (B2/C1)
- Wrong → next question easier (A2/B1)
- Mix: verb tense, articles, clause structure, conditionals, modals

```
tg(type:"quiz", text:"Choose the correct option:\n'The data ___ that...'", options:["shows", "show", "showing", "showed"], correct:1)
```

## Scoring & MEMORY Write

After all 5 steps, derive **independent band estimates per skill**:

| Signal                            | Band    |
| --------------------------------- | ------- |
| All Chinese / fragmented          | 3.0–3.5 |
| Simple sentences, frequent errors | 4.0–4.5 |
| Expresses ideas, moderate control | 5.0–5.5 |
| Clear expression, minor errors    | 6.0–6.5 |
| Accurate and flexible             | 7.0+    |

Write MEMORY using the `memory` tool with `target="memory"` and an explicit `action`:

- `Status.initialized: true`
- `Status.last_active`: today's date
- `Status.total_sessions: 1`
- `IELTS Bands.Speaking`: from Step 1
- `IELTS Bands.Listening`: from Step 2
- `IELTS Bands.Reading`: from Step 3
- `IELTS Bands.Writing`: from Step 4 (most data)
- `IELTS Bands.Overall`: average of 4 skills
- `IELTS Bands.updated`: today's date
- `Vocabulary.cefr`: from Step 4 + Step 5
- `Grammar Profile.weak`: error types found in Steps 4 + 5
- `Speaking Profile.pronunciation_weak`: from Step 1 pron_assess (if voice provided)
- `Focus.primary`: skill with lowest band
- `Focus.secondary`: (not set)
- All other fields: `(not set)`

## Result Message

Output format with **band ranges + confidence**:

```
📊 初始评估（置信度: 中）

| 技能 | 估计区间 | 置信度 |
|---|---|---|
| 🗣️ Speaking | 4.5-5.0 | {{conf}} |
| 🎧 Listening | 5.0-5.5 | {{conf}} |
| 📖 Reading | 5.5-6.0 | {{conf}} |
| ✍️ Writing | 5.0-5.5 | {{conf}} |

⚠️ 前 3-5 次正式训练后会校准到更精确的画像
```

Set emoji and tone based on the learner's saved coach-style preference in `USER.md`.

## Phase B: Calibration (first 3-5 formal sessions)

- Each skill needs ≥2 formal sessions to narrow band to ±0.5
- Confidence upgrades from "低" → "中" → "高"
- Every training session during calibration ends with the difficulty feedback keyboard
