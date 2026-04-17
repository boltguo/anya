# Mode: Examiner Sim 考官模拟

> Band 5.5+ | Low/No scaffolding | Full exam simulation with follow-ups

Default mode for learners at 5.5+ unless another mode is explicitly chosen.

## S3 — Select Part + Topic

Pick the Part type (don't repeat consecutively):

- **Part 1** (4-5 min): familiar topics — home, work, hobbies. 3 questions + 1-2 follow-ups.
- **Part 2** (3-4 min): cue card — 1 min prep + 1-2 min answer.
- **Part 3** (4-5 min): abstract discussion linked to Part 2. 2-3 layers of progressive follow-ups.

## S4 — Send Prompt

```
🗣️ **Speaking Part X**

<question / cue card>

⏱ <time guidance>
💡 试试用：<challenge words>

🎤 发语音或者打字回答都可以
```

## S5 — Collect Response + Follow-up

After the initial response:

- Band ≥ 6.5 → **aggressive follow-up**:
  ```
  "However, doesn't that contradict...? How would you respond to someone who says...?"
  ```
- Band < 6.5 → **gentle follow-up**:
  ```
  "Can you give me a specific example?"
  ```

Wait for the follow-up response.

## S6 — 4D Scoring + Behavioral Metrics

| Criterion                | Score   |
| ------------------------ | ------- |
| Fluency & Coherence      | X.0     |
| Pronunciation            | X.0     |
| Lexical Resource         | X.0     |
| Grammar Range & Accuracy | X.0     |
| **Overall**              | **X.0** |

Also track behavioral metrics (informational, not graded):

- `answer_length_seconds`
- `pause_count` (estimated)
- `self_correction_count`
- `filler_usage` (um, uh, like, you know)

## S7 — Focused Feedback

Top 2 errors with:

- ❌ Original phrase
- ✅ Corrected version + IPA for pronunciation errors
- 💬 Brief explanation
- Band-Up example: current sentence → +1.0 band version

TTS the corrected expressions.

## S8 — Micro Drill

Extract the stumble point → provide a high-band sentence pattern:

```
"试试用这个句型: 'While it is true that..., we cannot overlook the fact that...'"
```

`tts` plays the pattern.

## S9 — Forced Redo

```
tg(type:"force_reply", text:"用这个句型重说一遍你刚才卡住的部分")
```

Wait for voice → `pron_assess(audio_path, reference_text)` → compare with first attempt.

## S10 — Record

```
db name=learner sql="INSERT INTO samples (created_at, skill_type, prompt, band_overall, session_id) VALUES (datetime('now'), 'speaking', 'examiner_sim', ?, ?)" params='[null, "<session_id>"]'

db name=learner sql="INSERT INTO errors (sample_id, recurrence_key, category, severity, original_phrase, correction) VALUES (?, ?, ?, ?, ?, ?)" params='[<sample_id>, "<key>", "<cat>", "<sev>", "...", "..."]'
```

Difficulty feedback keyboard with this exit row:

```
🔁 继续=speaking | 📊 看报告=assessment | 🏠 返回=menu
```
