---
name: practice
description: "Practice entry: route learner to 6 IELTS skill drills"
version: "2.0.0"
metadatahermes:
  tags: [ielts, practice, menu, telegram]
  category: anya
---

# Practice Entry

## When to Use

- Learner says **generic** practice words: "练习", "学习", "practice", "开始练习", "我要练习"
- Learner taps a practice button from the main menu
- Returning from a completed exercise (TF10 "下一个练习")

**NOT this skill** if the learner specifies a type (e.g. "练口语", "背单词") — those go directly to the corresponding skill via SOUL.md Skill Shortcuts.

## Protocol

### Step 1 — Send Practice Menu

Send a **one-time Reply Keyboard** via native adapter. The keyboard auto-hides after the learner taps one option:

```bash
[native] adapter.reply-keyboard \
  --text "🎯 想练什么？点一个开始 👇" \
  --buttons '[["✍️ 写作","🗣️ 口语"],["📖 阅读","🎧 听力"],["📚 单词","📋 测评"]]' \
  --one-time
```

**Do NOT output any additional text reply in the same turn.** The reply-keyboard message is the only output — this avoids race conditions between the agent's streaming text and the script-sent message.

### Step 2 — Route to Training Skill

When the learner taps a button, Telegram sends the button text as a normal message. The agent matches it via SOUL.md's Skill Shortcuts table:

| User taps | Matched keyword | Routes to |
|---|---|---|
| ✍️ 写作 | 写作 | `writing` |
| 🗣️ 口语 | 口语 | `speaking` |
| 📖 阅读 | 阅读 | `reading` |
| 🎧 听力 | 听力 | `listening` |
| 📚 单词 | 单词 | `flashcard` |
| 📋 测评 | 测评 | `assessment` |

No callback routing needed — Reply Keyboard sends plain text, which flows through the standard message handler.

### callback Callback Reference

Other skills (e.g. `start` Phase 5, `[KEYBOARD:]` tags) may send Inline Keyboards with callback callbacks that also route here:

- `writing` → `writing`
- `speaking` → `speaking`
- `reading` → `reading`
- `listening` → `listening`
- `flashcard` → `flashcard`
- `assessment` → `assessment`

These are handled by the gateway's `_handle_custom_keyboard_callback` which re-injects the `callback data` string as a virtual text message, then matched by SOUL.md's Skill Shortcuts table.

## Rules

1. **Use one-time Reply Keyboard, not Inline Keyboard.** Reply Keyboard has zero race conditions — it sends text as normal messages, no callback routing required.
2. **Only send the keyboard, no text reply.** The reply-keyboard script call is the agent's entire output for that turn.
3. **One menu per request.** Don't re-send if the learner triggers practice twice in a row.
4. **After exercise completion** (TF10), show the menu again with the same one-time keyboard.
