---
name: speaking-roleplay
description: "Scenario dialogue (airport / restaurant / interview / clinic / hobby club). Anya plays one side, learner plays the other. 4-7 turns total."
---

# Speaking Roleplay (Scenario Dialogue)

Multi-turn realistic-setting dialogue. Complete a real-world function (book a room, complain about a bag, defend a film opinion) in the right register.

## 1. Inputs

Trigger when:

- User says: `情景`, `角色扮演`, `roleplay`, `机场`, `餐厅`, `面试`, `问路`.
- Callback `speaking-roleplay`.
- Planner routes here when `speaking.interaction` is weak, or register/politeness errors recurring.

Required context before generating:

1. `persist {"action":"recent_practice","session_id":"<session>","skill_type":"speaking.roleplay","limit":20}` (`limit` int, not `"DEDUP_WINDOW"` string — `Number()` would NaN it). Returns rows with `accuracy` (rubric 0..1), `prompt_hash`, `ui_feedback`, decoded `metadata` + flat `recent_prompt_hashes`. Source of truth for §2.3 credit and §2.4 dedup.
2. `persist {"action":"coach_context","days":14,"limit":8}` for subcaps / errors / due register patterns. Slow signal — only re-call when tier changes.
3. `MEMORY.md` / `USER.md` only as fallback. No raw `study.db` access.

## 2. Difficulty Policy

Target **i+1**: one stretch above the learner's current successful scenario. Adapt scenario abstraction, register formality, complication count; never throw a multi-step escalation at someone still botching a café order.

### 2.0 Constants & Tier

| Constant | Value | Meaning |
| --- | --- | --- |
| `PASS_THRESHOLD` | `0.70` | A round with `accuracy ≥ PASS` is a pass. |
| `FAIL_THRESHOLD` | `0.40` | Below = fail (function not achieved). |
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
abandoned (completed=0, early roleplay_end before meaningful turns) = 1 fail.
```

| Credit | Action |
| --- | --- |
| `promotion_credit ≥ STREAK` at tier ceiling | Promote tier; reset both credits; start at next tier's simplest scenario. |
| `promotion_credit ≥ STREAK` inside tier | Add **one** stretch (more complications, longer turns, or stricter register); reset `promotion_credit`. |
| `demotion_credit ≥ STREAK` at tier floor | Demote tier; reset both credits; start at prev tier's most complex scenario. |
| `demotion_credit ≥ STREAK` inside tier | Drop **one** stretch (no complications, shorter turns, looser register); reset `demotion_credit`. |
| early `roleplay_end` | Persists abandoned row (`completed=0`); surfaces as fail next call. |

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
2. Send scene announcement via `tg_msg type="render"` (text + buttons only, no `url` — this is the brief, not Anya's first line):
   - `text`: `🎬 **场景**：<scenario>\n**你是**：<learner role>\n**我是**：<Anya role>\n**目标**：<goal in plain Chinese>\n**语域**：<polite | casual | formal>\n\n💡 几个能用的句子：<2-3 useful chunks>\n\n准备好就按住录音说第一句吧！`
   - `buttons` (2 only, persist throughout conversation):

   ```json
   [["🆘 不知道怎么说|roleplay_sos", "👋 结束对话|roleplay_end"]]
   ```

3. Init empty `ui_feedback` accumulator; every button tap appends its exact label.
4. **Wait for user's first voice/text line.** The learner initiates — Anya does NOT speak first.

### State B: SOS Handling

`roleplay_sos`:

- Append `🆘 不知道怎么说` to `ui_feedback`.
- Send **text-only** scaffolding via `tg_msg type="render"` (text only, no `url`/`buttons`). The user reads the hint and directly records their next line.
- **Scaffolding content**: 2-3 useful phrases that fit the current scenario + turn context. Stay in character for the hints. Example:

  ```text
  试试这几个：
  • "Excuse me, I'd like to check in for my flight."
  • "Could you help me with my bag?"

  直接录音说说看 💪
  ```

- Wait for user's next voice/text. Handle in State C as a normal turn.

### State C: Dialogue Loop

**Anya stays in role throughout.** No mid-dialogue teaching (Hard Rule 1).

Each Anya turn is **one** `tg_msg type="render"` call (voice + spoiler text + buttons in one envelope):

```json
{
  "type": "render",
  "url": "<tts audio path of Anya's line>",
  "text": "||{Anya's line in English}||",
  "buttons": "[[\"🆘 不知道怎么说|roleplay_sos\", \"👋 结束对话|roleplay_end\"]]"
}
```

(Spoiler hides the text by default — user listens first, taps to reveal if stuck. `||...||` expands to `<tg-spoiler>` HTML.)

Wait for user's voice/text reply, or button tap.

**End signals** (any one triggers State C-End):
1. **User taps `👋 结束对话`** (`roleplay_end` callback) — manual end.
2. **Goal completed**: the scenario's functional goal has been achieved (order placed, complaint resolved, interview wrapped) — auto-end.
3. **Max 8 turns reached**: cap.

When any fires, proceed to State C-End.

**Complications**: at most ONE per dialogue (Hard Rule 3). Inject around turn 3–4 only at Intermediate+ tier. Don't stack two.

### State C-End: Summary & Evaluation

When an end signal fires (`roleplay_end`, goal completed, or max turns):

1. End the scene briefly in role (1 line), then **exit role**.
2. **Grade against §2.0 rubric** to produce `accuracy` (0..1).
3. Pick **one** language upgrade: 原句 → 升级版 → 原因.
4. **Persist FIRST** (State D), then send summary.

Summary content — deliver as a natural Chinese wrap-up:

- 🎯 功能完成度 (e.g. `0.85/1.0 — 目标达成，语域整体匹配`)
- ✅ 做得好的地方 (specific function they nailed or register match)
- 📝 升级建议 (1 upgrade: 原句 → 升级版 → 原因)
- 💡 下次可以试试 (1 actionable tip)

**Buttons (post-session, always):**

```json
[["🔄 再来一个场景|roleplay_next", "🧭 练习其他|nav:main"]]
```

**Critical**: summary + buttons in **one** `tg_msg type="render"` call (no `url` — summary has no media). On **perfect** (`accuracy === 1.0`) add `react: "🔥"` to the same call.

### State D: Persist Evidence

Call `persist action="practice"` **before** sending the State C-End summary.

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
  "feedback": "<IN ENGLISH: function completion + register verdict + 1 upgrade.>",
  "audio_path": "",
  "section": "speaking",
  "domain": "speaking",
  "load_score": 3,
  "minutes": 4,
  "mode": "study",
  "ui_feedback": "<comma-joined exact button labels tapped, e.g. '🆘 不知道怎么说' — empty if none>",
  "metadata": "{\"tier\":\"intermediate\",\"scenario\":\"restaurant_complaint\",\"register_target\":\"polite\",\"turns_completed\":6,\"complication_used\":true,\"promotion_credit_after\":1,\"demotion_credit_after\":0}",
  "errors": "[{\"key\":\"register_mismatch\",\"category\":\"speaking\",\"severity\":\"medium\",\"original\":\"yeah I want a refund\",\"correction\":\"Could I get a refund, please?\",\"note\":\"Slipped to casual in service-complaint.\"}]",
  "subcap_scores": "[{\"key\":\"speaking.interaction\",\"score\":7.0,\"evidence\":\"Achieved goal.\"},{\"key\":\"speaking.lexical_variety\",\"score\":6.5,\"evidence\":\"Reused 'want' 3x.\"},{\"key\":\"speaking.grammar_accuracy\",\"score\":7.5,\"evidence\":\"Tense consistent.\"}]"
}
```

`prompt_hash` = first 16 hex chars of `SHA-1(normalized scenario brief)`; normalize = lowercase + strip punctuation + collapse whitespace.

`ui_feedback` mandatory whenever any button was tapped.

State D persists fully-completed roleplays (goal completed or meaningful turns). If user taps `roleplay_end` before any meaningful turns, persist with `completed=0`.

Error keys: `register_mismatch`, `register_too_formal`, `register_too_casual`, `politeness_error`, `filler_overuse`, `function_incomplete`, `role_break`, `verb_form_error`, `l1_transfer`.

### State E: Continue (`roleplay_next`)

- Re-call `persist action="recent_practice"` (§1) for credits + dedup. Don't reconstruct from chat memory.
- Apply §2.3 (skip `redo_count > 0`) before generating.
- **NEVER re-call `coach_context` within the same skill session.** It is cached server-side (5-min TTL) and expensive. Only `recent_practice` needs re-reading for credits / dedup.
- Generate next scenario (State A step 1 — incl. dedup, scenario rotation per §2.4).

## 4. Collaborates With

- `planner`: routes here when `speaking.interaction` / register / politeness is the highest-value drill.
- `learner-state`: reads persisted evidence, computes long-running interaction ability, updates `MEMORY.md`.
- `planner`: (proactive nudge) uses errors/subcap scores to explain register patterns and politeness markers.
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

1. **Stay in role.** No mid-dialogue teaching. All feedback comes in State C-End, after the scene closes.
2. **Auto-end on goal completion or max 8 turns.** When the functional goal is achieved, auto-close. Max 8 turns is the cap.
3. **One complication maximum.** Don't stack two.
4. **Text fallback accepted.** Voice preferred but typed turns scored under the same rubric — don't penalize the modality.
5. **Feedback after, not during.** State C-End only.
6. **Register is enforced** — score register mismatches in `errors`.
7. **Persist entire transcript** in `response` for future `speaking-explain` lookups + `learner-state` evidence.
8. **All Telegram sends go through `tg_msg type="render"`.** Per Anya turn: one render call with `url` (voice) + `text` (spoiler line) + `buttons`. Setup brief (State A), SOS scaffold (State B text-only), summary (State C-End text + buttons) + perfect-score `react: "🔥"` all fold into render calls. Never split into separate `voice` / `text` / `keyboard` / `react` calls.
9. Use `persist` for reads/writes; no raw DB. Don't update `MEMORY.md`; `learner-state` owns durable ability state.
10. **ASR uncertainty handling.** When a voice transcription produces a semantically absurd sentence that doesn't fit the scenario context (e.g., "ample wealth" when the user likely said "Apple Wallet"), do NOT score it as a semantic error. Instead:
    - Stay in role: "Sorry, I didn't catch that — could you say it again?"
    - Record `{"key":"asr_uncertain","category":"speaking","severity":"info","note":"Transcription '...' is likely ASR error, not learner mistake."}` in `errors` if it persists.
    - Give the user one free retry on that turn — it does not count toward the turn total or accuracy.
    - If the retried transcription is still absurd, accept the text turn as-is and do not penalize.
