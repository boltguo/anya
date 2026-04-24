---
name: listening-shadowing
description: "Clip-level listening shadow — rhythm + keyword retention + prosody capture."
---

# Listening Shadowing

Different from `speaking-shadowing` (phoneme accuracy). Here the goal is to stay with the speaker — decoding speed and rhythm, not isolated phonemes.

## When to Use

- `听力跟读 / 影子跟读`
- Callback `listening-shadowing`
- `listening.connected_speech ≤ 5.5` OR recent `connected_speech_fail`

## Clip profile

| Band | Length | Accent |
| ---- | ------ | ------ |
| < 5.5 | 40-60 sec, slower GB | GB only |
| 5.5-6.5 | 60-80 sec natural | GB primary; occasional US |
| 6.5+ | 60-90 sec with connected speech | GB + US + AU rotation |

## Workflow

1. Warm-up: play the clip once without a task.
2. Shadow pass: `tts` + `force_reply` "边听边跟读，结束后发语音。".
3. Transcribe. Compute:
   - content-word retention rate (target ≥ 70%)
   - duration ratio (learner / source; target ≤ 1.15)
   - which window was best / worst
4. Optional: `pron_assess` Word granularity only if pronunciation flagged weak.
5. Feedback: keep% + ratio + best window + worst window (with reason). Reveal source via `<tg-spoiler>`.
6. Optional micro-drill: speaking-shadowing-style repeat of the worst 5-8 words only.
7. Difficulty keyboard.

## Persist

- 1 `samples` row (`load_score=2`, `feedback={keep_pct, ratio, best, worst}`).
- `subcap_scores.listening.connected_speech` from keep_pct + ratio.
- `errors`: `connected_speech_fail` if keep_pct < 60% OR ratio > 1.3.

Queries: `support/ielts-data-contract/references/queries.md`.

## Rules

1. **Warm-up listen first.** Blind shadow is demoralizing.
2. **Score rhythm, not phonemes.**
3. **Accent rotation above 6.5.**
4. **Micro-drill only on the worst window.**
5. **`pron_assess` only when pronunciation is flagged** (save latency).
6. **Content aligned with interests.**
