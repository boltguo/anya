---
name: listening-shadowing
description: "Listening Rhythm Shadowing. Trigger when the user wants to practice listening comprehension by repeating short chunks. Focuses on rhythm, chunking, and catching fast speech, NOT isolated pronunciation."
required_tools:
  - generate_listening_clip
  - assess_listening_fluency
---

# Listening Shadowing

Stay with the speaker — decoding speed and rhythm. **Fluency** drives i+1; the credit gating, sentence generation, and scoring math all live in compound tools. Your job is to route + write conversational feedback.

## 1. Inputs

Trigger when:
- User says: `听力跟读`, `影子跟读`, `跟读`, `shadowing`.
- Callback `listening-shadowing`.
- **Disambiguation**: bare `跟读` defaults here (rhythm). Route to `speaking-shadowing` only on explicit phoneme/发音/口音/怎么读/不会读.

The first round needs an initial tier hint (Beginner / Intermediate / Advanced). Read from `MEMORY.md`:
1. Prefer `Band Snapshot.Listening` (CEFR). Map `A1`/`A2` → Beginner, `B1` → Intermediate, `B2`/`C1`/`C2` → Advanced. Boundary suffix (`A2+`, `B1-`) → 降一级起步.
2. If CEFR missing, lowest sub-cap in `Weak Spots.Listening` (0–10) → tier table in `generate_listening_clip` docs.
3. **Never** treat `Core Capabilities.Listening: <n>/100` as IELTS band — that's a capability score.

Pick **target weakness** from `persist coach_context` (cached server-side, 5-min TTL — read once per skill session, never re-call):
- top recurring `listening.*` error key, or
- the lowest `listening.*` subcap.

## 2. Flow

### State A: Deliver

Call `generate_listening_clip` ONCE per round:

```json
{
  "session_id": "<session>",
  "target_weakness": "listening.connected_speech",
  "current_tier": "<from MEMORY.md or previous round>",
  "current_length": <previous clip_words or tier-min>,
  "voice": "en-US-AriaNeural"
}
```

Returns `{ prompt, prompt_hash, audio_path, tier, clip_words, decision, ... }`. Credit gating + dedup + sentence generation + tts are all inside.

Then send **one** `tg_msg type="render"`. Mention the difficulty change naturally when one happened (`decision.action !== "hold"`) — keep it short, conversational, Anya voice:

| `decision.action` + `decision.reason` | One-line phrasing in the tg_msg text (mix into Anya tone) |
| --- | --- |
| `length_up` | "你连过 3 句都很稳，这次给你多加一个词试试 ✨" |
| `promote_tier` | "你稳进 <new tier>! 难度悄悄升级了，准备好" |
| `length_down` + `reason: streak` | "刚才连卡了 3 句，这次缩短一个词重新找节奏" |
| `length_down` + `reason: too_hard_tap` | "好的，我把句子缩短一个词，慢慢来 🐢" |
| `demote_tier` + `reason: streak` | "我把难度往下挪一格，先把基本节奏跟稳" |
| `demote_tier` + `reason: too_hard_tap` | "OK，整体回退一档，先找回节奏感" |
| `hold` | （不提，正常发题） |

```json
{
  "type": "render",
  "url": "<audio_path from tool>",
  "text": "🎧 先盲听一遍，然后直接按住录音，<b>一边听一边跟阿尼亚读（影子跟读）</b>。\n[难度变动一句话，若 action != hold]\n如果实在跟不上，可以点开看原文：||<prompt from tool>||",
  "buttons": "[[\"🐢 慢速播放|shadow_slow\", \"😵 太难了，降级|shadow_hard\"]]"
}
```

Remember `{prompt, prompt_hash, audio_path, tier, clip_words}` for State C / D / F (you'll need them).

### State B: Buttons before recording

`shadow_slow`:
- Brief ack via `tg_msg type="render"` text-only.
- Re-render at slow rate: call `tts` with `{"text": "<prompt>", "voice": "<same>", "rate": "-10%"}`. **Keep the original audio_path** — that's what `assess_listening_fluency` needs later.
- Re-send via one `tg_msg type="render"` (slower audio + same buttons).
- Append `🐢 慢速播放` to a local `button_taps` accumulator.

`shadow_hard`:
1. Persist abandoned row FIRST via `persist action="practice"`:
   ```json
   {
     "skill_type": "listening.shadowing",
     "session_id": "<session>",
     "completed": 0,
     "accuracy": 0,
     "prompt": "<the original prompt>",
     "prompt_hash": "<same as State A>",
     "response": "",
     "feedback": "Learner tapped '😵 太难了，降级' before recording.",
     "audio_path": "<original audio_path>",
     "section": "listening",
     "minutes": 0,
     "metadata": "{\"button_taps\":[\"😵 太难了，降级\"],\"abandoned_reason\":\"too_hard\",\"tier\":\"<tier>\",\"clip_words\":<n>}"
   }
   ```
2. Brief ack → go to State A with the same `target_weakness`. `generate_listening_clip` will see the abandoned row in `recent_practice` and demote automatically.

### State C: Evaluate (user sent voice)

**One mandatory tool call: `assess_listening_fluency`.** Do NOT call `pron_assess`, `persist`, or `generate_fluency_coaching_audio` directly — all three fold in:

```json
{
  "user_audio_path": "<from THIS turn's user message: [voice | audio_path=...]>",
  "reference_prompt": "<the prompt from State A>",
  "original_audio_path": "<the original-speed audio_path from State A — NOT the -10% slow version>",
  "session_id": "<session>",
  "target_weakness": "<same as State A>",
  "tier": "<from State A>",
  "clip_words": <from State A>,
  "voice": "<voice used in State A, e.g. en-US-AriaNeural>",
  "button_taps": "<JSON array, e.g. [\"🐢 慢速播放\"]>"
}
```

Returns `{ ok, sample_id, pass, scores, accuracy_ratio, weak_words, recognized_text, coaching_audio_path, coaching_chunks, next_step }`. When `pass=false`, `coaching_audio_path` is pre-rendered for you (unless degradation — then it's `null`).

Branch on `pass`:

**`pass === false`** → forced re-practice, no buttons:
- Send **one** `tg_msg type="render"` with `url=<coaching_audio_path>` (if non-null), text=<feedback>, **no buttons**.
- Feedback MUST mention the `coaching_chunks` so the user knows what to focus on.
- If `coaching_audio_path === null`: send text-only feedback, ask user to replay the original.
- Wait for next voice → State F.

**`pass === true`** → continue:
- Send **one** `tg_msg type="render"` (no url): text=<feedback> + buttons `[["🔄 再来一句|shadow_next","🧭 练习其他|nav:main"]]`.
- If `accuracy_ratio === 1.0`: add `react: "🔥"` in the same call.

### State D: Feedback content

Every reply MUST cover:
- The four scores in this exact order: **准确度 / 流利度 / 完整度 / 韵律感**. Show all four numbers (from `scores`).
- The correct English passage.
- A 1-line Chinese translation.
- 1–2 sentences naming **specific 1–2 chunks** that broke rhythm (use `weak_words`).

Two to four sentences after the score line. Anya voice. No fixed template.

### State E: Continue (`shadow_next`)

Call `generate_listening_clip` again with:
- `current_tier` = the tier from the LAST `assess_listening_fluency` result
- `current_length` = the clip_words from the LAST round
- `target_weakness` = the same key (or a different `listening.*` subcap if you've already covered this one for 2+ rounds — pick from cached `coach_context.errors`).

Then State A.

### State F: Implicit re-practice

User sent another voice after a `pass=false` round. Same passage:

1. Recover `prompt`, `prompt_hash`, `original audio_path` from your State A memory. If session was compacted, call `persist {"action":"recent_practice","session_id":"<session>","skill_type":"listening.shadowing","limit":1}` and read them from the most-recent row's `prompt` + `prompt_hash` + `audio_path` fields.
2. Call `assess_listening_fluency` with:
   - `user_audio_path` = the **NEW voice this turn** (extract from `[voice | audio_path=...]` in the incoming user message).
   - `original_audio_path` = the recovered TTS reference path.
   - Same `reference_prompt`, `session_id`, `target_weakness`, `tier`, `clip_words` as the previous round.
3. Apply the same binary `pass` branch as State C. On retry-pass, skip coaching audio.

## 3. Failure And Fallbacks

- `generate_listening_clip` returned `ok: false` with `step: "dedup"` → very rare. Tell user "稍等一下我换一个题目" and retry with a different `target_weakness`.
- `assess_listening_fluency` returned `ok: false` with `step: "pron_assess"` → brief feedback that assessment was unavailable; offer `shadow_next`. **Never** evaluate the recognized text manually — Whisper-style ASR auto-corrects pronunciation and would give a false pass.
- `assess_listening_fluency` returned `coaching_audio_path: null` on a `pass=false` round (coaching generation degraded) → still send text feedback (no `url`); ask user to replay the original.
- User types instead of recording → prompt for voice; typed answer is not a valid shadowing attempt.
- Empty / inaudible audio → ask once: replay / `shadow_hard` / skip. If skipped, write `completed=0` via `persist` directly.

## 4. Hard Rules

1. **Voice in → `assess_listening_fluency` MUST be the first tool call.** Never call `pron_assess`, `persist`, or `generate_fluency_coaching_audio` directly during State C/F; all are folded into the compound tool to prevent skipping.
2. **State A / E → `generate_listening_clip` MUST be the first tool call.** Never call `recent_practice` + a sentence-generation LLM round + `tts` manually; they are folded in to prevent re-implementing credit gating in prose.
3. **No early reveals**: never show the transcript before they attempt, except inside `<tg-spoiler>` (`||...||`).
4. **All Telegram sends go through `tg_msg type="render"`.** Voice + text + buttons + `react: "🔥"` all fold into one render call.
5. **Binary buttons by `pass`**: `pass=false` → no buttons + coaching audio + forced re-practice; `pass=true` → `shadow_next` + `nav:main`. Never a dedicated retry button.
6. **Feedback content (not format)**: every report covers 4 scores (准确度/流利度/完整度/韵律感), correct passage, brief translation, specific rhythm/linking diagnosis. Anya voice. No fixed template.
7. **Surface difficulty change**: when `generate_listening_clip` returned `decision.action !== "hold"`, the State A tg_msg MUST include a one-line mention of the change so the learner sees the system adapting. Never silently adjust.

## 5. Collaborates With

- `planner`: routes here when listening rhythm / connected-speech / chunking is the highest-value drill.
- `learner-state`: reads persisted evidence, computes long-running tempo state, updates `MEMORY.md`.
- `speaking-shadowing`: complementary phoneme-focused skill (route there only on explicit phoneme/发音/口音 cues).
