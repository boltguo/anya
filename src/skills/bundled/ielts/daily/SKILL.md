---
name: daily
description: 'Daily micro-training: 5 formats tied to weekly plan focus'
version: '2.0.0'
metadatahermes:
  tags: [ielts, daily, briefing, cron, micro]
  category: anya
---

# Daily Micro-Training

## When to Use

- Triggered by cron at **08:30 every day**
- Learner says "今天", "今日", "晨报", "daily"

## Resources

- **Briefing formats**: `./daily/templates/briefing_formats.md`

## Protocol

1. **Gather context**:
   - Read plan: `tracker_db.js get-plan` → this week's focus + carry-over errors
   - Read MEMORY: focus, top errors, band levels
   - Read USER.md: hobbies, engage topics
   - Check last daily format used (avoid repeating)

2. **Pick format**: Select from A/B/C/D/E based on plan focus + rotation:

   | Format | Name                 | Best for               | Plan alignment                    |
   | ------ | -------------------- | ---------------------- | --------------------------------- |
   | **A**  | Phrase → Sentence    | Vocabulary building    | primary_skill = any               |
   | **B**  | Error Correction     | Grammar/accuracy       | carry_over_errors present         |
   | **C**  | Paraphrase Challenge | Listening/reading prep | primary_skill = listening/reading |
   | **D**  | Speaking Warm-up     | Fluency/pronunciation  | primary_skill = speaking          |
   | **E**  | Writing Micro        | Sentence-level writing | primary_skill = writing           |

   **Selection logic**:
   - If carry_over_errors has grammar keys → prefer Format B
   - If plan primary = speaking → prefer Format D
   - If plan primary = writing → prefer Format E
   - If plan primary = listening/reading → prefer Format C
   - Otherwise → Format A (default)
   - Never repeat the same format on consecutive days

3. **Send** the micro-lesson (see templates)

4. **Record** learner's response (if any) via `data` with `--skill-type daily`

5. **Add new words** (if any) via `data`

## Format Details

### Format A — Phrase → Sentence

Pick a word/phrase from recent vocab or plan focus. Learner builds a sentence.

```
☀️ Good morning!

📝 **Word of the Day**: {{word}} /{{ipa}}/
🇨🇳 {{chinese}}
💡 "{{example_sentence}}"
🔊 [TTS pronunciation]

Quick challenge: 用 "{{word}}" 造一个关于 {{hobby}} 的句子
```

### Format B — Error Correction Drill

Target the top carry-over error from the plan.

```
☀️ Good morning!

🔧 **Fix This Sentence**:
❌ "{{broken_sentence}}"

What's wrong? 发你的修正版本！
```

Sentence targets the specific error type (e.g., sv_agreement → "The data shows...").

### Format C — Paraphrase Challenge

Build paraphrase recognition for listening/reading.

```
☀️ Good morning!

🔄 **Paraphrase Challenge**:

原句: "The government should allocate more funds to education."

下面哪个是最好的同义替换？
```

```
tg(type:"quiz", text:"Best paraphrase?", options:["A: ...", "B: ...", "C: ...", "D: ..."], correct:N)
```

### Format D — Speaking Warm-up

Quick 20-second speaking prompt.

```
☀️ Good morning!

🗣️ **20-Second Challenge**:
"What's one thing you're looking forward to today?"

🎤 发语音回答 — 不用完美，说就对了！
```

If voice received → brief encouragement + 1 quick tip.

### Format E — Writing Micro

One sentence improvement task.

```
☀️ Good morning!

✍️ **Sentence Upgrade**:

把这个句子升级为雅思高分版本:
"Technology is good for education."

💡 Hint: 试试用 beneficial, facilitate, enhance 其中一个
```

## Rules

1. **Under 3 minutes.** Warm-up, not a full session.
2. **Rotate formats.** Never repeat the same format on consecutive days.
3. **Align with the plan.** Format selection follows weekly plan focus.
4. **Personalize topics** from USER.md hobbies and engage topics.
5. **If absent 3+ days**: gentle re-entry, no guilt-tripping. Use Format A (lightest).
6. **Record responses** via `data` for tracking engagement.
7. **New words encountered** → offer `[加入单词本|ck:word:save]`.
