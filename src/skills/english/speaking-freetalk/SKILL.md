---
name: speaking-freetalk
description: "MUST trigger for conversational practice, free-flowing speaking, or impromptu debates. Open chat with no fixed source. 3-4 back-and-forth turns. Trigger for 'let's chat', 'freetalk', 'debate'."
---

# Speaking Freetalk (Impromptu And Debate)

Open chat with no source clip and no fixed function. Sustain a natural multi-turn English conversation about a topic, with stealth feedback at the end.

## 1. Inputs

Trigger when:

- User says: `Let's chat`, `口语闲聊`, `debate`, `freetalk`.
- Callback `speaking-freetalk`.
- Planner routes here when `speaking.fluency` or `speaking.interaction` is weak and a low-pressure warm-up is appropriate.

Required context before generating:

1. `persist {"action":"recent_practice","session_id":"<session>","skill_type":"speaking.freetalk","limit":20}` (`limit` int, not `"DEDUP_WINDOW"` string — `Number()` would NaN it). Returns rows with `accuracy` (rubric 0..1), `prompt_hash`, `ui_feedback`, decoded `metadata` + flat `recent_prompt_hashes`. Source of truth for §2.3 credit and §2.4 dedup.
2. `persist {"action":"coach_context","days":14,"limit":8}` for subcaps / errors / due topic patterns. Slow signal — only re-call when tier changes.
3. `MEMORY.md` / `USER.md` only as fallback. No raw `study.db` access.

## 2. Difficulty Policy

Target **i+1**: one stretch above the learner's current successful chat depth. Adapt topic abstraction, push-back intensity, and required turn substance; never throw an "AI replacing jobs" debate at someone still struggling to describe their weekend.

### 2.0 Constants & Tier

| Constant | Value | Meaning |
| --- | --- | --- |
| `PASS_THRESHOLD` | `0.65` | A round with `accuracy ≥ PASS` is a pass. |
| `FAIL_THRESHOLD` | `0.35` | Below = fail (collapsed under 3 turns, or fell to Chinese throughout). |
| `STREAK` | `2` | Passes/fails to move tier / push-back intensity. |
| `ACC_WINDOW` | `3` | Sample window for §2.2 mean. |
| `DEDUP_WINDOW` | `20` | Rolling `prompt_hash` window. |

**Score rubric (CRITICAL):** grade the whole conversation (not per turn) on this scale, then pass it as `accuracy`:

| Score | Rubric |
| --- | --- |
| `1.00` | Sustained 3–4 substantive turns + on-topic + advanced phrasing + recovered from at least one push-back. |
| `0.85` | 3–4 turns, mostly substantive; at least one nuanced opinion. |
| `0.70` | 3–4 turns but shallow / one-word answers mixed in; minor topic drift. |
| `0.50` | < 3 turns OR significant topic drift OR collapsed to canned phrases. |
| `0.25` | Engaged but mostly in Chinese / one-word answers / refused push-back. |
| `0.00` | Refused, switched fully to Chinese, or off-topic throughout. |

Use this rubric verbatim — score **engagement + topic depth**, NOT phoneme accuracy or grammar elegance. Granular `speaking.fluency` / `speaking.lexical_variety` / `speaking.grammar_accuracy` (0–10) go into `subcap_scores` separately for `learner-state`.

| Tier (IELTS band ≈ CEFR) | Topic kind | Push-back | Expected turn substance |
| --- | --- | --- | --- |
| Beginner (< 5.0 ≈ A1–A2) | Familiar everyday — daily routine, food, weekend plans, favorite shows / games | None or 1 simple follow-up | Full-sentence answers, no one-word replies |
| Intermediate (5.0–6.0 ≈ B1) | Opinion / trade-off — pros and cons, comparison, "which would you pick" | 1 gentle push-back ("but what about…") | A reason + one example per turn |
| Advanced (≥ 6.5 ≈ B2+) | Controversial or abstract — AI replacing jobs, ethical dilemmas, identity, sci-fi premises | 1–2 push-backs with hedging requests | Hedged claims, concession + counter, hypotheticals |

**Reading the learner's level from `MEMORY.md`** (do NOT confuse capability score 0–100 with IELTS band 0–9):

1. Prefer `Band Snapshot.Speaking` (CEFR string). Map: `A1`/`A2` → Beginner, `B1` → Intermediate, `B2`/`C1`/`C2` → Advanced.
2. Boundary suffix (`A2+`, `B1-`, `... → ... boundary`): **降一级起步**. E.g. `A2+` → Beginner.
3. If CEFR missing, fall back to 14-day `speaking.fluency` mean from `coach_context.summary.subcaps` and use the tier table above.
4. **Never** read `Core Capabilities.Speaking: <n>/100` as IELTS band — that's a 0–100 capability score.

### 2.2 Recent-accuracy

Mean `accuracy` over last `ACC_WINDOW` `completed=1` rows of current `session_id` + `skill_type`. Abandoned (`completed=0`) excluded from mean but count as fail for `demotion_credit`.

Fallback chain when fewer than `ACC_WINDOW` rows: 14-day `speaking.fluency` mean from `coach_context.summary` → `MEMORY.md` band − 1 tier at simplest topic → Beginner familiar-everyday. Never guess upward.

### 2.3 Credit gating

```
promotion_credit = walk recent_practice.rows newest→oldest (skip redo_count>0):
  count consecutive accuracy ≥ PASS; reset on any fail (< FAIL or completed=0); holds ([FAIL, PASS)) pass through.
demotion_credit = mirror: count consecutive fail; reset on any pass; holds pass through.
abandoned (completed=0, early freetalk_end before meaningful turns) = 1 fail.
```

| Credit | Action |
| --- | --- |
| `promotion_credit ≥ STREAK` at tier ceiling | Promote tier; reset both credits; start at next tier's simplest topic. |
| `promotion_credit ≥ STREAK` inside tier | Add **one** stretch (deeper push-back, more abstract topic, or stricter substance bar); reset `promotion_credit`. |
| `demotion_credit ≥ STREAK` at tier floor | Demote tier; reset both credits; start at prev tier's most concrete topic. |
| `demotion_credit ≥ STREAK` inside tier | Drop **one** stretch (no push-back, more concrete topic); reset `demotion_credit`. |
| `freetalk_end` before meaningful turns | Persists abandoned row (`completed=0`); surfaces as fail next call. |

Retry rows (`redo_count > 0`) skipped from credit; still count for dedup.

Hold: keep tier, optionally swap **one** topic family (work → hobby or vice versa) to probe a different weakness.

### 2.4 Generation

- Pick a topic at the chosen tier's complexity. Frame as a single thought-provoking question, not a multi-part prompt.
- Stretch **at most one** dimension per round: topic abstraction, push-back intensity, required substance.
- Reject any topic whose `prompt_hash` ∈ `recent_practice.recent_prompt_hashes` (`prompt_hash` based on the topic question).
- Don't reuse the same topic family (tech-AI / film / game / food / current-events) for 2+ consecutive rounds.
- **Topic rotation**: alternate work themes (frontend, AI tools, remote-work English, interview scenarios) with the learner's hobbies in `USER.md` (films, games, anime, comedy variety). Don't default every prompt to tech/AI just because the learner is a programmer. E.g. Beginner-hobby = "what did you watch on weekend?"; Intermediate-hobby = "TFT vs Honor of Kings: which rewards skill more?"; Advanced-hobby = "do auto-chess games reward strategy or luck more?".

## 3. Flow

### State A: Hook

1. From §2.3 + §2.4, decide tier, topic (rotate), push-back plan. Compute `prompt_hash` on the topic question; regenerate on dedup hit.
2. `tts` for the hook question only (one short audio, ~5–10 seconds).
3. Send voice + instruction + buttons in **one** `tg_msg type="render"` call. Renders as two bubbles (voice + text-with-buttons) for clean cross-client display — still one tool call.
4. Init empty `ui_feedback` accumulator; every button tap appends its exact label.

Render envelope:

```json
{
  "type": "render",
  "url": "<tts audio path>",
  "text": "💬 <topic question>\n\n按住录音键说说你的看法（卡壳就点 SOS）。",
  "buttons": "[[\"🆘 不知道怎么说|freetalk_sos\", \"👋 结束聊天|freetalk_end\"]]"
}
```

Wait for the user's voice / text reply, or button tap.

### State B: SOS Handling

`freetalk_sos`:

- Append `🆘 不知道怎么说` to `ui_feedback`.
- Send **text-only** scaffolding via `tg_msg type="render"` (text only, no `url`/`buttons`). The user just reads and then directly records their voice. Showing buttons here is unnecessary — they know how to continue.
- **Scaffolding content**: 3 useful phrases + 1 sentence starter tailored to the current topic. Example:

  ```text
  试试这几个：
  • "I think it depends on…"
  • "What I usually do is…"
  • "For example, …"

  直接录音说说看 💪
  ```

- Wait for user's next voice/text reply. When it arrives, handle it in State C as a normal turn.

### State C: Conversation Loop

The conversation continues **until the user taps `👋 结束聊天` or max 8 turns reached** (whichever first).

Each user turn:

1. Listen to their response (transcribe if voice; accept text directly).
2. Push back gently per tier plan (§2.0): "I see your point, but what about…", "Could you give an example?". For Beginner tier, just acknowledge and ask one simple follow-up.
3. **Stealth feedback**: do NOT stop the flow to correct every error. Mention at most 1 advanced phrase **within YOUR response naturally** — don't break the conversation.
4. Send the next response via **one** `tg_msg type="render"` call (`url=<tts>`, `text=<your reply>`, `buttons=<same 2 buttons below>`):

   ```json
   [["🆘 不知道怎么说|freetalk_sos", "👋 结束聊天|freetalk_end"]]
   ```

### State C-End: Summary & Evaluation

When user taps `👋 结束聊天` (`freetalk_end` callback) or max 8 turns reached:

1. **Grade against §2.0 rubric** to produce a continuous `accuracy` (0..1).
2. Compute granular subcaps (`speaking.fluency`, `speaking.lexical_variety`, `speaking.grammar_accuracy`) on 0–10 scale.
3. **Persist FIRST** (State D), then send the summary.

Summary content — deliver as a natural Chinese wrap-up:

- 🎯 整体评分 (e.g. `0.70/1.0 — 聊了 4 轮，观点清晰但用词重复`)
- ✅ 做得好的地方 (quote 1 specific phrase they used well)
- 📝 升级建议 (1 concrete upgrade: 原句 → 升级版 → 原因)
- 💡 下次可以试试 (1 sentence of actionable next-step)

**Buttons (post-session, always):**

```json
[["🔄 换个话题继续聊|freetalk_next", "🧭 练习其他|nav:main"]]
```

**Critical**: summary + buttons in **one** `tg_msg type="render"` call (no `url`). On **perfect** (`accuracy === 1.0`) add `react: "🔥"` to the same call.

### State D: Persist Evidence

Call `persist action="practice"` **before** sending the State C-End summary.

ONE row per freetalk session (not per turn).

Minimum payload:

```json
{
  "skill_type": "speaking.freetalk",
  "session_id": "<session>",
  "prompt": "<original topic question>",
  "prompt_hash": "<sha1(normalized prompt) first 16 chars>",
  "response": "<full transcript: each turn joined with '\\n--\\n', user + Anya alternating>",
  "accuracy": 0.70,
  "raw_score": 0.70,
  "max_score": 1,
  "feedback": "<IN ENGLISH: engagement + depth verdict + 1 upgrade.>",
  "audio_path": "",
  "section": "speaking",
  "domain": "speaking",
  "load_score": 2,
  "minutes": 3,
  "mode": "study",
  "ui_feedback": "<comma-joined exact button labels tapped, e.g. '🆘 不知道怎么说' — empty if none>",
  "metadata": "{\"tier\":\"intermediate\",\"topic\":\"tft_vs_honor_of_kings\",\"topic_family\":\"hobby_game\",\"turns_completed\":3,\"sos_used\":false,\"promotion_credit_after\":1,\"demotion_credit_after\":0}",
  "errors": "[{\"key\":\"vocabulary_repetition\",\"category\":\"speaking\",\"severity\":\"medium\",\"original\":\"good\",\"correction\":\"rewarding\",\"note\":\"Reused 'good' 4x.\"}]",
  "subcap_scores": "[{\"key\":\"speaking.fluency\",\"score\":6.5,\"evidence\":\"Sustained turns; minor pauses.\"},{\"key\":\"speaking.lexical_variety\",\"score\":5.5,\"evidence\":\"'good' 4x.\"},{\"key\":\"speaking.interaction\",\"score\":7.0,\"evidence\":\"Engaged with push-back.\"}]"
}
```

`prompt_hash` = first 16 hex chars of `SHA-1(normalized topic question)`; normalize = lowercase + strip punctuation + collapse whitespace. Read dedup window via `recent_practice.recent_prompt_hashes` (§1).

`ui_feedback` mandatory whenever any 🆘 button was tapped, even on `accuracy=1.0`.

State D persists fully-completed freetalks only (3+ turns). If user taps `freetalk_end` before 3 turns, persist with `completed=0`.

Error keys: `filler_overuse`, `verb_form_error`, `l1_transfer`, `vocabulary_repetition`, `register_mismatch`, `topic_drift`. Record only 1–2 errors (Hard Rule 4).

### State E: Continue (`freetalk_next`)

- Re-call `persist action="recent_practice"` (§1) for credits + dedup. Don't reconstruct from chat memory.
- Apply §2.3 (skip `redo_count > 0`) before generating.
- **NEVER re-call `coach_context` within the same skill session.** It is cached server-side (5-min TTL) and expensive. Only `recent_practice` needs re-reading for credits / dedup.
- Generate next topic (State A step 1 — incl. dedup, topic rotation per §2.4). Respect "no more than 2 consecutive same topic family" (§2.4).

## 4. Collaborates With

- `planner`: routes here when `speaking.fluency` / engagement is the highest-value drill.
- `learner-state`: reads persisted evidence, computes long-running fluency state, updates `MEMORY.md`.
- `planner`: (proactive nudge) uses errors/subcap scores to explain fluency / lexical-variety patterns.
- `vocab-harvest`: turns auto-harvested upgrades into review items.
- `support/data-contract`: defines the `persist` write protocol.

## 5. Failure And Fallbacks

- `tts` fails → text-only hook OK (this skill is text-tolerant; voice is preferred but not required).
- Transcription fails → ask the user to type their reply (text fallback accepted, no penalty).
- `persist` fails → still send feedback, but say it was not saved.
- User switches to Chinese → 1 in-character nudge + offer SOS scaffolding; if they continue in Chinese, score the round at ≤ 0.50 per rubric (≥ 0.25 if engaged).
- User refuses push-back / one-word answers → score at ≤ 0.50; mention in feedback "more substance next round" but stay encouraging.

## 6. Hard Rules

1. **Fluency over accuracy.** Keep the conversation flowing. Stealth feedback at the end of YOUR turn, not interrupting the learner's flow.
2. **The "I'm Stuck" protocol**: if the user uses native language or hits SOS, do NOT grade them. Provide a word bank immediately and resume.
3. **All Telegram sends go through `tg_msg type="render"`.** Voice + text + buttons + perfect-score `react: "🔥"` (when `accuracy === 1.0`) all fold into one render call. Never split into separate `voice` / `text` / `keyboard` / `react` calls.
4. **At most 1–2 errors logged** per session, only ones you gave stealth feedback on.
5. **User controls when to stop; max 8 turns.** The conversation ends on `👋 结束聊天` tap or after 8 turns, whichever comes first.
6. **Feedback after, not during** (except inline stealth in §State C step 3).
7. Use `persist` for reads/writes; no raw DB.
8. Don't update `MEMORY.md`; `learner-state` owns durable ability state.
9. **TTS = English question ONLY.** The `tts` call text must be the English hook question verbatim — do NOT include Chinese prompts ("按住录音键…"), button descriptions, or emoji in the TTS input.
