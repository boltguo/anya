---
name: speaking-roleplay
description: "Scenario dialogue (airport / restaurant / interview / clinic / hobby club). Anya plays one side, learner plays the other. 4-7 turns total."
---

# Speaking Roleplay (Scenario Dialogue)

Multi-turn realistic-setting dialogue. Different from `speaking-freetalk` (open chat with no fixed goal) and `speaking-repeat` (single-shot retell). Goal here: complete a real-world function (book a room, complain about a bag, defend a film opinion) in the right register. The signal driving i+1 is a **rubric-graded function-completion + register-match score** (0..1), not binary pass/fail.

## 1. Inputs

Trigger when:

- User says: `情景`, `角色扮演`, `roleplay`, `机场`, `餐厅`, `面试`, `问路`.
- Callback `speaking-roleplay`.
- Planner/coach routes here when `speaking.interaction` is weak, or register/politeness errors recurring.

Required context before generating:

1. `persist {"action":"recent_practice","session_id":"<session>","skill_type":"speaking.roleplay","limit":20}` (`limit` int, not `"DEDUP_WINDOW"` string — `Number()` would NaN it). Returns rows with `accuracy` (rubric 0..1), `prompt_hash`, `ui_feedback`, decoded `metadata` + flat `recent_prompt_hashes`. Source of truth for §2.3 credit and §2.4 dedup.
2. `persist {"action":"coach_context","days":14,"limit":8}` for subcaps / errors / due register patterns. Slow signal — only re-call when tier changes.
3. `MEMORY.md` / `USER.md` only as fallback. No raw `study.db` access.

## 2. Difficulty Policy

Target **i+1**: one stretch above the learner's current successful scenario. Adapt scenario abstraction, register formality, complication count; never throw a multi-step escalation at someone still botching a café order.

### 2.0 Constants & Tier

| Constant | Value | Meaning |
| --- | --- | --- |
| `PASS_THRESHOLD` | `0.70` | A round with `accuracy ≥ PASS` is a pass. Lower than dictation/shadowing because function-completion is rubric-graded and forgiving by design. |
| `FAIL_THRESHOLD` | `0.40` | Below = fail (function not achieved). Wider hold band reflects rubric noise. |
| `STREAK` | `2` | Passes/fails to move tier / scenario complexity. |
| `ACC_WINDOW` | `3` | Sample window for §2.2 mean. |
| `DEDUP_WINDOW` | `20` | Rolling `prompt_hash` window. |

**Score rubric (CRITICAL):** grade the whole roleplay (not per turn) on this scale, then pass it as `accuracy`:

| Score | Rubric |
| --- | --- |
| `1.00` | All goals achieved + register matched throughout + complications navigated naturally. |
| `0.85` | Goals achieved; minor register slip or one missed politeness cue. |
| `0.70` | Main goal achieved; missed 1 secondary goal OR 1 register match. |
| `0.50` | Got partial way through; broke role / register multiple times. |
| `0.25` | Stayed engaged but completely missed the function. |
| `0.00` | Refused, switched to Chinese throughout, or off-topic. |

Use this rubric verbatim — score **function completion + register match**, NOT phoneme accuracy or grammar elegance. Granular `speaking.interaction` / `speaking.lexical_variety` / `speaking.grammar_accuracy` (0–10) go into `subcap_scores` separately.

| Tier (IELTS band ≈ CEFR) | Scenario complexity | Register | Complication |
| --- | --- | --- | --- |
| Beginner (< 5.0 ≈ A1–A2) | Concrete service interactions — café order, simple directions, hotel check-in | Polite / neutral, scripted phrases | None |
| Intermediate (5.0–6.0 ≈ B1) | Goal-oriented multi-step — airport check-in with bag issue, restaurant + complaint, clinic visit | Polite + light negotiation | At most 1 complication mid-dialogue |
| Advanced (≥ 6.5 ≈ B2+) | Negotiation / abstract — job interview, phone complaint with escalation, university enrolment cross-questioning | Formal / hedging / softening | Up to 1 complication; expect cross-questioning |

**Reading the learner's level from `MEMORY.md`** (do NOT confuse capability score 0–100 with IELTS band 0–9):

1. Prefer `Band Snapshot.Speaking` (CEFR string). Map: `A1`/`A2` → Beginner, `B1` → Intermediate, `B2`/`C1`/`C2` → Advanced.
2. Boundary suffix (`A2+`, `B1-`, `... → ... boundary`): **降一级起步**. E.g. `A2+` → Beginner.
3. If CEFR missing, fall back to 14-day `speaking.interaction` mean from `coach_context.summary.subcaps` and use the tier table above.
4. **Never** read `Core Capabilities.Speaking: <n>/100` as IELTS band — that's a 0–100 capability score.

### 2.2 Recent-accuracy

Mean `accuracy` over last `ACC_WINDOW` `completed=1` rows of current `session_id` + `skill_type`. Abandoned (`completed=0`) excluded from mean but count as fail for `demotion_credit`.

Fallback chain when fewer than `ACC_WINDOW` rows: 14-day `speaking.interaction` mean from `coach_context.summary` → `MEMORY.md` band − 1 tier at simplest scenario → Beginner café order. Never guess upward.

### 2.3 Credit gating

```
promotion_credit = walk recent_practice.rows newest→oldest (skip redo_count>0):
  count consecutive accuracy ≥ PASS; reset on any fail (< FAIL or completed=0); holds ([FAIL, PASS)) pass through.
demotion_credit = mirror: count consecutive fail; reset on any pass; holds pass through.
abandoned (completed=0, written by `roleplay_hard`) = 1 fail.
```

| Credit | Action |
| --- | --- |
| `promotion_credit ≥ STREAK` at tier ceiling | Promote tier; reset both credits; start at next tier's simplest scenario. |
| `promotion_credit ≥ STREAK` inside tier | Add **one** stretch (more complications, longer turns, or stricter register); reset `promotion_credit`. |
| `demotion_credit ≥ STREAK` at tier floor | Demote tier; reset both credits; start at prev tier's most complex scenario. |
| `demotion_credit ≥ STREAK` inside tier | Drop **one** stretch (no complications, shorter turns, looser register); reset `demotion_credit`. |
| `roleplay_hard` tap | Persists abandoned row (State B); surfaces as fail next call. |

Retry rows (`redo_count > 0`) skipped from credit; still count for dedup.

Hold: keep tier, optionally swap **one** scenario family (work → hobby or vice versa) to probe a different weakness.

### 2.4 Generation

- Pick scenario from a tier-appropriate library (see §2.4 list below).
- Stretch **at most one** dimension per round: scenario complexity, register, complication count, turn length.
- Reject any scenario whose `prompt_hash` ∈ `recent_practice.recent_prompt_hashes` (`prompt_hash` based on the scenario brief — 身份+对方+目标).
- **Scenario rotation**: alternate work scenarios (job interview, work meeting, remote-job onboarding, code-review pair) with hobby scenarios (gaming forum support, film discussion club, anime convention check-in, variety-show audience interview, board-game cafe). Pull hobby scenarios from `USER.md` → Personal interests. Don't default every roleplay to interview/work just because the learner's profession is tech.

**Scenario library** (pick one matching tier):

| Tier | Work-themed | Hobby-themed |
| --- | --- | --- |
| Beginner | Hotel check-in, café order, asking directions | Cinema ticket, board-game cafe order, anime merch shop |
| Intermediate | Airport check-in with bag issue, restaurant + complaint, clinic visit, work-meeting clarification | Film discussion club, gaming forum support ticket, variety-show audience interview |
| Advanced | Job interview, phone complaint with escalation, university enrolment, salary negotiation | Anime convention press scrum, MOBA team strategy debate, AI-tool indie-dev pitch |

## 3. Flow

### State A: Setup Scene

1. From §2.3 + §2.4, decide tier, scenario, register. Compute `prompt_hash` on the scenario brief (身份 + 对方 + 目标); regenerate on dedup hit.
2. Send scene announcement via `tg_msg type="keyboard"` (no audio yet — this is the brief, not Anya's first line):
   - Text: `🎬 **场景**：<scenario>\n**你是**：<learner role>\n**我是**：<Anya role>\n**目标**：<goal in plain Chinese>\n**语域**：<polite | casual | formal>\n\n💡 几个能用的句子：<2-3 useful chunks>\n\n准备好就开始（按住录音说第一句，或者点退出）。`
   - Buttons: `[["😵 换个场景|roleplay_hard"]]` (single escape pre-engagement)
3. Init empty `ui_feedback` accumulator; every button tap appends its exact label.
4. Wait for the user's voice / text first line, or `roleplay_hard` tap.

### State B: Dialogue Loop (4–7 turns)

Once the user delivers their first line, enter the loop. Each Anya turn:

1. Generate Anya's next line in role (stays in role — **no mid-dialogue teaching**, see Hard Rule 1).
2. Generate audio via `tts` for Anya's line.
3. Send voice FIRST: `tg_msg type="voice"` with the audio `url`. Wait for delivery.
4. THEN send `tg_msg type="force_reply"` with **text only** — never include `url` here, the force_reply endpoint has no media slot:
   - Text: `<tg-spoiler>{Anya's line in English}</tg-spoiler>` (spoiler so the learner can attempt to decode by ear first; tap to reveal if stuck)
5. Accept user's voice OR text reply (Hard Rule 4 — text fallback accepted).
6. Loop back to step 1 until 4–7 turns total reached, or natural close.

**Mid-dialogue button tap** (`roleplay_hard`): treat the same as State B abandon below (persist + replace).

**Complications**: at most ONE per dialogue (Hard Rule 3). Inject around turn 3–4 only at Intermediate+ tier — e.g., the airline lost the bag, the interviewer pushes back on a weak claim, the clinic asks a follow-up symptom. Don't stack two.

### State B (escape): `roleplay_hard`

1. **Persist abandoned record FIRST** (a "drop the level" tap mid-roleplay is the highest-value signal for dropping scenario complexity):

   ```json
   {
     "action": "practice",
     "skill_type": "speaking.roleplay",
     "session_id": "<session>",
     "completed": 0,
     "accuracy": 0,
     "prompt": "<scenario brief: roles + goal + register>",
     "prompt_hash": "<sha1(normalized brief) first 16 chars>",
     "response": "<turns completed so far, joined>",
     "feedback": "Learner tapped '换个场景' before completing. Treat as negative evidence at this scenario tier.",
     "audio_path": "",
     "ui_feedback": "😵 换个场景",
     "section": "speaking",
     "domain": "speaking",
     "load_score": 1,
     "minutes": 1,
     "mode": "study",
     "metadata": "{\"abandoned_reason\":\"too_complex\",\"tier\":\"<beginner|...|advanced>\",\"scenario\":\"<name>\",\"turns_completed\":<n>}"
   }
   ```

   After `persist` returns, reset `ui_feedback`.

2. **Replacement.** Apply demotion / scenario-down (§2.3). Brief ack via `tg_msg type="text"`, generate a new simpler scenario → State A.

### State C: Close And Feedback

Triggered when the dialogue reaches a natural close OR 7 turns elapsed (whichever first).

1. End the scene briefly in role (1 line), then EXIT role.
2. **Grade against §2.0 rubric** to produce a continuous `accuracy` (0..1). Score:
   - **功能完成度** (function completion): did they achieve the goal?
   - **语域** (register match): polite / casual / formal as briefed?
   - Optional sub-signals: filler overuse, politeness errors, role-break frequency.
3. Pick **one** language upgrade: 原句 → 升级版 → 原因. Auto-harvest the upgrade chunk.
4. **Persist FIRST, THEN feedback.** Sequential — the row must be in DB before feedback reaches the learner.

Feedback content (no fixed header/template) — every reply MUST cover, in some natural form:

- the rubric score (e.g. `🎯 功能完成度: 0.70/1.0 — 主要目标达成，语域偶尔过随便`)
- 做到 / 缺：what they nailed and what was missing (function or register)
- one **upgrade**: 原句 → 升级版 → 原因 (e.g. `"I want a refund" → "Could I get a refund, please?" — 服务投诉场景需要更礼貌的请求语气`)
- Optionally: one **micro drill** — ask them to use the upgrade in one new short turn (no separate persist — it goes into next session)

Two to four sentences after the score line, conversational.

Buttons (always, regardless of accuracy):

```json
[["🔄 再来一个场景|roleplay_next", "🧭 练习其他|nav:main"]]
```

**Critical**: feedback + buttons in **one** `tg_msg type="keyboard"` call. Never `type="text"` then `type="edit"` — see Hard Rule 9.

### State D: Persist Evidence

Call `persist action="practice"` (or omit `action`) **before** sending the State C feedback `tg_msg`.

ONE row per roleplay session (not per turn).

Minimum payload:

```json
{
  "skill_type": "speaking.roleplay",
  "session_id": "<session>",
  "prompt": "<scenario brief: roles + goal + register>",
  "prompt_hash": "<sha1(normalized brief) first 16 chars>",
  "response": "<full transcript: each turn joined with '\\n--\\n', user + Anya alternating>",
  "accuracy": 0.70,
  "raw_score": 0.70,
  "max_score": 1,
  "feedback": "<IN ENGLISH: function completion + register verdict + 1 upgrade. e.g. 'Achieved the refund goal but slipped to casual register at turn 3 (\"yeah I want\"). Upgrade: \"Could I get…\". Reason: service-complaint scenarios expect hedged requests.'>",
  "audio_path": "",
  "section": "speaking",
  "domain": "speaking",
  "load_score": 3,
  "minutes": 4,
  "mode": "study",
  "ui_feedback": "<comma-joined exact button labels tapped this round, e.g. '😵 换个场景' — empty if none>",
  "metadata": "{\"tier\":\"intermediate\",\"scenario\":\"restaurant_complaint\",\"register_target\":\"polite\",\"turns_completed\":6,\"complication_used\":true,\"promotion_credit_after\":1,\"demotion_credit_after\":0}",
  "errors": "[{\"key\":\"register_mismatch\",\"category\":\"speaking\",\"severity\":\"medium\",\"original\":\"yeah I want a refund\",\"correction\":\"Could I get a refund, please?\",\"note\":\"Slipped to casual register in service-complaint context.\"},{\"key\":\"filler_overuse\",\"category\":\"speaking\",\"severity\":\"low\",\"note\":\"3+ um/like fillers in turn 2.\"}]",
  "subcap_scores": "[{\"key\":\"speaking.interaction\",\"score\":7.0,\"evidence\":\"Achieved goal; navigated complication.\"},{\"key\":\"speaking.lexical_variety\",\"score\":6.5,\"evidence\":\"Reused 'want' 3 times instead of varying.\"},{\"key\":\"speaking.grammar_accuracy\",\"score\":7.5,\"evidence\":\"Tense consistent; minor article slip.\"}]"
}
```

`prompt_hash` = first 16 hex chars of `SHA-1(normalized scenario brief)`; normalize = lowercase + strip punctuation + collapse whitespace. Read dedup window via `recent_practice.recent_prompt_hashes` (§1).

`ui_feedback` mandatory whenever any 😵 button was tapped, even on `accuracy=1.0`.

State D persists fully-completed roleplays only. Abandoned rows are written by State B.

Error keys: `register_mismatch`, `register_too_formal`, `register_too_casual`, `politeness_error`, `filler_overuse`, `function_incomplete`, `role_break`, `verb_form_error`, `l1_transfer`.

### State E: Continue (`roleplay_next`)

- Re-call `persist action="recent_practice"` (§1) for credits + dedup. Don't reconstruct from chat memory.
- Apply §2.3 (skip `redo_count > 0`) before generating.
- Skip `coach_context` re-call unless tier changed.
- Generate next scenario (State A step 1 — incl. dedup, scenario rotation per §2.4).

## 4. Collaborates With

- `planner`: routes here when `speaking.interaction` / register / politeness is the highest-value drill.
- `learner-state`: reads persisted evidence, computes long-running interaction ability, updates `MEMORY.md`.
- `coach`: uses errors/subcap scores to explain register patterns and politeness markers.
- `vocab-harvest`: turns auto-harvested upgrades into review items.
- `speaking-azure-score`: optional `pron_assess` on long turns if pronunciation flagged weak.
- `support/data-contract`: defines the `persist` write protocol.

## 5. Failure And Fallbacks

- `tts` fails → text error, no fake `audio_path` for that turn. Continue with text-only Anya turn.
- Transcription fails → ask the user to type the turn (Hard Rule 4 — text fallback accepted).
- `persist` fails → still send feedback, but say it was not saved.
- `<tg-spoiler>` is client-side; no callback. Don't invent `spoiler_used`.
- User switches to Chinese mid-loop → 1 in-role nudge ("could you say that in English?"); if they continue in Chinese, score the round at ≤ 0.50 per rubric.

## 6. Hard Rules

1. **Stay in role.** No mid-dialogue teaching. All feedback comes in State C, after the scene closes.
2. **4–7 turns.** Less = under-practice; more = fatigue.
3. **One complication maximum.** Don't stack two.
4. **Text fallback accepted.** Voice preferred but typed turns scored under the same rubric — don't penalize the modality.
5. **Feedback after, not during.** State C only.
6. **Register is enforced** — score register mismatches in `errors`.
7. **Persist entire transcript** in `response` for future `speaking-explain` lookups + `coach` evidence.
8. **Voice before instruction, sequential.** Per turn: `tg_msg type="voice"` first, THEN `type="force_reply"`. Never bundle audio into `force_reply` or `keyboard` — those endpoints have no media slot and audio would be dropped silently.
9. **One-call keyboard** (State A and State C): text + buttons in a single `tg_msg type="keyboard"` call.
10. Use `persist` for reads/writes; no raw DB. Don't update `MEMORY.md`; `learner-state` owns durable ability state.
