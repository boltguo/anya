---
name: speaking-freetalk
description: "MUST trigger for conversational practice — chat, debate, or scenario roleplay. Anya picks a seed and opens with voice; user replies and the dialogue flows. 3–8 turns. Trigger for 'let's chat', 'freetalk', 'debate', '情景', 'roleplay', '机场', '餐厅', '面试'."
---

# Speaking Freetalk

Multi-turn English conversation. On entry, Anya picks **one** conversation seed (random within the learner's tier), sends a brief Chinese intro + a **voice opening line**, then waits. The user replies and the chat unfolds for up to 8 turns. One unified flow — no mode branching.

A seed is either a **topic** ("Should AI replace teachers?") or a **scene** (you're checking in at the airport, I'm the agent). The picker rotates between the two flavors so each session can be either casual debate or scenario roleplay; pick weight by tier (scenes feel more concrete at Beginner; abstract topics open up at Advanced).

## 1. Inputs

Trigger when:

- User says: `Let's chat`, `口语闲聊`, `debate`, `freetalk`, `情景`, `roleplay`, `角色扮演`, `机场`, `餐厅`, `面试`, `问路`, `客服`, or describes a scene ("假设我在咖啡店点单").
- Callback `speaking-freetalk`.
- Planner routes here when `speaking.fluency` / `speaking.interaction` is weak.

If the user **named** a specific topic or scene, honor it (enforce tier-appropriate complexity). Otherwise pick one yourself.

Required context before generating:

1. `persist {"action":"recent_practice","session_id":"<session>","skill_type":"speaking.freetalk","limit":20}` (`limit` int). Returns rows with `accuracy`, `prompt_hash`, decoded `metadata` (incl. `button_taps`) + flat `recent_prompt_hashes`. Source of truth for §2.3 credit and §2.4 dedup.
2. `persist {"action":"coach_context","days":14,"limit":8}` for subcaps / errors. Slow signal — only re-call when tier changes.
3. `MEMORY.md` / `USER.md` only as fallback. No raw `study.db` access.

## 2. Difficulty Policy

Target **i+1**: one stretch above the learner's current successful chat depth. Adapt seed complexity, push-back intensity, turn-substance bar; never throw an "AI replacing jobs" debate at someone still struggling to describe their weekend.

### 2.0 Constants & Tier

| Constant | Value | Meaning |
| --- | --- | --- |
| `PASS_THRESHOLD` | `0.65` | A round with `accuracy ≥ PASS` is a pass. |
| `FAIL_THRESHOLD` | `0.35` | Below = fail (collapsed under 3 turns, or fell to Chinese throughout). |
| `STREAK` | `2` | Passes/fails to move tier / push-back intensity. |
| `ACC_WINDOW` | `3` | Sample window for §2.2 mean. |
| `DEDUP_WINDOW` | `20` | Rolling `prompt_hash` window. |

**Score rubric (CRITICAL):** grade the whole conversation (not per turn), then pass it as `accuracy`:

| Score | Rubric |
| --- | --- |
| `1.00` | Sustained 3–4 substantive turns + on-topic + advanced phrasing + recovered from at least one push-back / complication. |
| `0.85` | 3–4 turns, mostly substantive; at least one nuanced opinion or function completion. |
| `0.70` | 3–4 turns but shallow / one-word answers mixed in; minor drift. |
| `0.50` | < 3 turns OR significant drift OR collapsed to canned phrases. |
| `0.25` | Engaged but mostly in Chinese / one-word answers / refused push-back. |
| `0.00` | Refused, switched fully to Chinese, or off-topic throughout. |

Score **engagement + topic depth (for topics) or function completion + register (for scenes)** — NOT phoneme accuracy or grammar elegance. Granular `speaking.fluency` / `speaking.lexical_variety` / `speaking.grammar_accuracy` / `speaking.interaction` (0–10) go into `subcap_scores` for `learner-state`.

| Tier (IELTS band ≈ CEFR) | Topics | Scenes | Push-back / complication |
| --- | --- | --- | --- |
| Beginner (< 5.0 ≈ A1–A2) | Familiar everyday — daily routine, food, weekend plans, shows / games | Concrete service — café order, asking directions, hotel check-in | None or 1 simple follow-up; no complication |
| Intermediate (5.0–6.0 ≈ B1) | Opinion / trade-off — pros & cons, "which would you pick" | Goal-oriented multi-step — airport check-in with bag issue, restaurant + complaint, clinic visit | 1 gentle push-back OR 1 complication mid-dialogue |
| Advanced (≥ 6.5 ≈ B2+) | Controversial / abstract — AI replacing jobs, ethical dilemmas, sci-fi premises | Negotiation / abstract — job interview, phone complaint with escalation, salary negotiation | 1–2 push-backs with hedging; up to 1 complication |

**Seed library** (rotate across rounds — pull hobby items from `USER.md` interests):

| Tier | Work-flavored | Hobby-flavored |
| --- | --- | --- |
| Beginner | Hotel check-in, café order, asking directions, "describe your weekend" | Cinema ticket, board-game cafe order, anime merch shop, "favorite show this month" |
| Intermediate | Airport check-in with bag issue, restaurant + complaint, "remote work pros and cons", clinic visit | Film discussion club, gaming forum support ticket, "TFT vs Honor of Kings", variety-show audience interview |
| Advanced | Job interview, phone complaint with escalation, "AI replacing teachers", salary negotiation | Anime convention press scrum, MOBA team strategy debate, "do auto-chess games reward strategy or luck", AI-tool indie-dev pitch |

**Reading the learner's level from `MEMORY.md`** (do NOT confuse capability score 0–100 with IELTS band 0–9):

1. Prefer `Band Snapshot.Speaking` (CEFR string). Map: `A1`/`A2` → Beginner, `B1` → Intermediate, `B2`/`C1`/`C2` → Advanced.
2. Boundary suffix (`A2+`, `B1-`): **降一级起步**.
3. If CEFR missing, fall back to 14-day `speaking.fluency` mean from `coach_context.summary.subcaps`.
4. **Never** read `Core Capabilities.Speaking: <n>/100` as IELTS band.

### 2.2 Recent-accuracy

Mean `accuracy` over last `ACC_WINDOW` `completed=1` rows of current `session_id` + `skill_type`. Abandoned (`completed=0`) excluded from mean but count as fail for `demotion_credit`.

Fallback chain when fewer than `ACC_WINDOW` rows: 14-day `speaking.fluency` mean from `coach_context.summary` → `MEMORY.md` band − 1 tier at simplest seed → Beginner familiar-everyday. Never guess upward.

### 2.3 Credit gating

```
promotion_credit = walk recent_practice.rows newest→oldest (skip rows with parent_sample_id IS NOT NULL):
  count consecutive accuracy ≥ PASS; reset on any fail (< FAIL or completed=0); holds ([FAIL, PASS)) pass through.
demotion_credit = mirror: count consecutive fail; reset on any pass; holds pass through.
abandoned (completed=0, early freetalk_end before meaningful turns) = 1 fail.
```

| Credit | Action |
| --- | --- |
| `promotion_credit ≥ STREAK` at tier ceiling | Promote tier; reset both credits; start at next tier's simplest seed. |
| `promotion_credit ≥ STREAK` inside tier | Add **one** stretch (deeper push-back, more abstract topic / scene, or stricter substance bar); reset `promotion_credit`. |
| `demotion_credit ≥ STREAK` at tier floor | Demote tier; reset both credits; start at prev tier's most concrete seed. |
| `demotion_credit ≥ STREAK` inside tier | Drop **one** stretch (no push-back, more concrete seed); reset `demotion_credit`. |
| `freetalk_end` before meaningful turns | Persists abandoned row (`completed=0`); surfaces as fail next call. |

Redo rows (`parent_sample_id IS NOT NULL`) skipped from credit; still count for dedup.

Hold: keep tier, optionally swap **one** seed family (work → hobby or vice versa) to probe a different weakness.

### 2.4 Generation

- Pick a seed at the chosen tier's complexity. For topics, frame as a single thought-provoking question; for scenes, define roles + goal + register.
- Stretch **at most one** dimension per round: seed abstraction, push-back intensity, required substance.
- Reject any seed whose `prompt_hash` ∈ `recent_practice.recent_prompt_hashes` (`prompt_hash` based on the seed brief — topic question OR scene `身份+对方+目标`).
- Don't reuse the same seed family (tech-AI / film / game / food / service-counter / interview) for 2+ consecutive rounds.
- **Rotation**: alternate work-flavored and hobby-flavored across rounds. Don't default every seed to tech just because the learner is a programmer.

## 3. Flow

### State A: Open With A Voice Line

1. From §2.3 + §2.4, decide tier and pick a seed (topic OR scene — rotate). Compute `prompt_hash` on the seed brief; regenerate on dedup hit.
2. **One** `tg_msg type="render"` call — Chinese intro line + Anya's English opening (voice + spoiler text + buttons), all in one envelope:

   ```json
   {
     "type": "render",
     "url": "<tts of Anya's opening line>",
     "text": "<Chinese intro — 1 line>\n\n||{Anya's English opening line}||",
     "buttons": "[[\"🆘 不知道怎么说|freetalk_sos\", \"👋 结束聊天|freetalk_end\"]]"
   }
   ```

   Chinese intro line examples:
   - Topic: `💬 聊聊：AI 会替代老师吗？听我先说，然后开口接` → voice = "Hey, real talk — do you actually think AI is gonna replace teachers in five years?"
   - Scene: `🎬 情景：机场 check-in 行李超重。你是乘客，我是地勤。听我先开口` → voice = "Good morning! Could I see your passport and ticket, please?"

   `||...||` hides Anya's English line behind a spoiler — user listens first, taps to reveal if stuck.

3. Init empty `metadata.button_taps` accumulator; every button tap appends its exact label.

Wait for the user's voice / text reply, or button tap.

### State B: SOS Handling

`freetalk_sos`:

- Append `🆘 不知道怎么说` to `metadata.button_taps`.
- Send **text-only** scaffolding via `tg_msg type="render"` (no `url` / `buttons`). 3 useful phrases tailored to the current seed, in character if the seed is a scene:

  ```text
  试试这几个：
  • "I think it depends on…"
  • "What I usually do is…"
  • "For example, …"

  直接录音说说看 💪
  ```

  For scene seeds, the phrases come from the learner's role's perspective (e.g. "Could I get a refund, please?" for a complaint scene).
- Wait for user's next voice/text reply. Handle in State C as a normal turn.

### State C: Conversation Loop

The conversation continues **until the user taps `👋 结束聊天`, max 8 turns reached, or (for scene seeds) the functional goal has been achieved** — whichever first.

Each user turn:

1. Listen to their response (transcribe if voice; accept text directly).
2. **Push back / advance** per tier plan (§2.0):
   - Topics: "I see your point, but what about…", "Could you give an example?". Beginner = simple follow-up.
   - Scenes: **stay in role**. No mid-dialogue teaching. Advance toward the goal; at Intermediate+ you may inject **at most ONE complication** around turn 3–4.
3. Send Anya's next response via **one** `tg_msg type="render"` call — voice + spoiler text + same 2 buttons:

   ```json
   {
     "type": "render",
     "url": "<tts of Anya's reply>",
     "text": "||{Anya's English reply}||",
     "buttons": "[[\"🆘 不知道怎么说|freetalk_sos\", \"👋 结束聊天|freetalk_end\"]]"
   }
   ```

### State C-End: Summary & Evaluation

When the user taps `👋 结束聊天`, max 8 turns reached, OR (scene seed) the functional goal has been achieved:

1. End briefly (for scene: 1 line in role, then exit role).
2. **Grade against §2.0 rubric** to produce a continuous `accuracy` (0..1). Weight engagement + topic depth for topics; weight function completion + register match for scenes.
3. Compute granular subcaps (`speaking.fluency`, `speaking.lexical_variety`, `speaking.grammar_accuracy`, `speaking.interaction`) on 0–10 scale.
4. **Persist FIRST** (State D), then send the summary.

Summary content — natural Chinese wrap-up:

- 🎯 整体评分 (e.g. `0.70/1.0 — 聊了 4 轮，观点清晰但用词重复`)
- ✅ 做得好的地方 (quote 1 specific phrase they used well)
- 📝 升级建议 (1 concrete upgrade: 原句 → 升级版 → 原因)
- 💡 下次可以试试 (1 sentence of actionable next-step)

**Buttons (post-session):**

```json
[["🔄 换一个继续聊|freetalk_next", "🧭 练习其他|nav:main"]]
```

Summary + buttons in **one** `tg_msg type="render"` call (no `url`). On **perfect** (`accuracy === 1.0`) add `react: "🔥"` to the same call.

### State D: Persist Evidence

Call `persist action="practice"` **before** sending the State C-End summary. ONE row per session.

Minimum payload:

```json
{
  "skill_type": "speaking.freetalk",
  "session_id": "<session>",
  "prompt": "<seed brief — topic question OR scene身份+对方+目标>",
  "prompt_hash": "<sha1(normalized brief) first 12 hex chars>",
  "response": "<full transcript: each turn joined with '\\n--\\n', user + Anya alternating>",
  "accuracy": 0.70,
  "raw_score": 0.70,
  "max_score": 1,
  "feedback": "<IN ENGLISH: engagement + depth verdict + 1 upgrade.>",
  "audio_path": "",
  "section": "speaking",
  "minutes": 3,
  "mode": "study",
  "metadata": "{\"seed_kind\":\"topic\",\"seed\":\"ai_replacing_teachers\",\"seed_family\":\"work_tech\",\"tier\":\"intermediate\",\"turns_completed\":3,\"sos_used\":false,\"promotion_credit_after\":1,\"demotion_credit_after\":0}",
  "errors": "[{\"key\":\"vocabulary_repetition\",\"category\":\"speaking\",\"severity\":\"medium\",\"original\":\"good\",\"correction\":\"rewarding\",\"note\":\"Reused 'good' 4x.\"}]",
  "subcap_scores": "[{\"key\":\"speaking.fluency\",\"value\":6.5,\"evidence\":\"Sustained turns; minor pauses.\"},{\"key\":\"speaking.lexical_variety\",\"value\":5.5,\"evidence\":\"'good' 4x.\"},{\"key\":\"speaking.interaction\",\"value\":7.0,\"evidence\":\"Engaged with push-back.\"}]"
}
```

`seed_kind` is `topic` | `scene`. Scene rows additionally include `register_target` and `complication_used` in metadata, and may use error keys `register_mismatch`, `register_too_formal`, `register_too_casual`, `politeness_error`, `function_incomplete`, `role_break`.

`prompt_hash` = first 12 hex chars of `SHA-1(normalized seed brief)`; normalize = lowercase + strip punctuation + collapse whitespace.

`metadata.button_taps` mandatory whenever any 🆘 button was tapped, even on `accuracy=1.0`.

State D persists fully-completed sessions only (3+ turns OR scene goal reached). If user taps `freetalk_end` before that, persist with `completed=0`.

Topic error keys: `filler_overuse`, `verb_form_error`, `l1_transfer`, `vocabulary_repetition`, `register_mismatch`, `topic_drift`. Record only 1–2 errors (Hard Rule 4).

### State E: Continue (`freetalk_next`)

- Re-call `persist action="recent_practice"` (§1) for credits + dedup. Don't reconstruct from chat memory.
- Apply §2.3 before generating.
- **NEVER re-call `coach_context` within the same skill session.** It is cached server-side (5-min TTL). Only `recent_practice` needs re-reading.
- Generate next seed (State A — incl. dedup, rotation per §2.4). Respect "no 2+ consecutive same family".

## 4. Collaborates With

- `planner`: routes here when `speaking.fluency` / `speaking.interaction` is the highest-value drill.
- `learner-state`: reads persisted evidence, computes long-running fluency state, updates `MEMORY.md`.
- `vocab-harvest` (side-effect protocol): turns auto-harvested upgrades into review items.
- `support/data-contract`: defines the `persist` write protocol.

## 5. Failure And Fallbacks

- `tts` fails → fall back to text-only opening line (this skill is text-tolerant; voice preferred but not required).
- Transcription fails → ask the user to type their reply (text fallback accepted, no penalty).
- `persist` fails → still send feedback, but say it was not saved.
- User switches to Chinese → 1 in-character nudge + offer SOS scaffolding; if they continue in Chinese, score the round at ≤ 0.50 per rubric (≥ 0.25 if engaged).
- User refuses push-back / one-word answers → score at ≤ 0.50; mention in feedback "more substance next round" but stay encouraging.
- ASR uncertainty: if a voice transcription produces a semantically absurd sentence (e.g. "ample wealth" when user likely said "Apple Wallet"), stay in role, ask for a repeat ("Sorry, I didn't catch that — could you say it again?"), and don't penalize.

## 6. Hard Rules

1. **Anya always opens first** with a voice line. The user never speaks first in this skill.
2. **Fluency over accuracy.** Topics: optional stealth feedback inside Anya's own turn. Scenes: NO mid-dialogue feedback — stay in role; all feedback in State C-End.
3. **The "I'm Stuck" protocol**: if the user uses native language or hits SOS, do NOT grade them. Provide a word bank immediately and resume.
4. **At most 1–2 errors logged** per session.
5. **User controls when to stop; max 8 turns.** End on `👋 结束聊天`, 8 turns, or (scene seed) auto-end when the functional goal is achieved.
6. **Feedback after, not during** (except inline stealth in Topic-flavored State C).
7. **All Telegram sends go through `tg_msg type="render"`.** Voice + text + buttons + perfect-score `react: "🔥"` all fold into one render call. Never split into separate `voice` / `text` / `keyboard` / `react` calls.
8. Use `persist` for reads/writes; no raw DB. Don't update `MEMORY.md`; `learner-state` owns durable ability state.
9. **TTS = Anya's English line ONLY.** The `tts` call text must be Anya's English opening / reply verbatim — do NOT include Chinese intros, button labels, or emoji.
