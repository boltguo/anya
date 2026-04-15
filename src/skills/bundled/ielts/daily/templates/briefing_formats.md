# Daily Briefing Formats

Rotate through these 5 formats. Don't repeat the same format on consecutive days.
Selection is tied to the weekly plan focus (see daily/SKILL.md).

## Format A — Phrase → Sentence (Vocabulary)

```
☀️ **Good morning!**

📝 **Word of the Day**: {{word}} /{{ipa}}/
🇨🇳 {{chinese}}
💡 "{{example_sentence}}"
🔊 [TTS pronunciation]

Quick challenge: 用 "{{word}}" 造一个关于 {{hobby}} 的句子
```

## Format B — Error Correction Drill (Grammar)

```
☀️ **Good morning!**

🔧 **Fix This Sentence**:
❌ "{{broken_sentence}}"

What's wrong? 发你的修正版本！
```

Sentence should target the top carry-over error from the weekly plan (e.g., sv_agreement, article_usage).

## Format C — Paraphrase Challenge (Listening/Reading)

```
☀️ **Good morning!**

🔄 **Paraphrase Challenge**:

原句: "{{original_sentence}}"

下面哪个是最好的同义替换？
```

Follow with quiz poll:

```
tg(type:"quiz", text:"Best paraphrase?", options:["A: ...", "B: ...", "C: ...", "D: ..."], correct:N)
```

After answer: explain why the correct option is the best paraphrase + note the key synonym pairs.

## Format D — Speaking Warm-up (Fluency)

```
☀️ **Good morning!**

🗣️ **20-Second Challenge**:
"{{speaking_prompt}}"

🎤 发语音回答 — 不用完美，说就对了！
```

Speaking prompts should be simple, personal, and tied to USER.md interests:

- "What's one thing you're looking forward to today?"
- "Describe your morning routine in 3 sentences."
- "What did you enjoy most about yesterday?"

If voice received → brief encouragement + 1 quick pronunciation/grammar tip.

## Format E — Writing Micro (Sentence-Level)

```
☀️ **Good morning!**

✍️ **Sentence Upgrade**:

把这个句子升级为雅思高分版本:
"{{simple_sentence}}"

💡 Hint: 试试用 {{suggested_words}} 其中一个
```

Simple sentences to upgrade:

- "Technology is good for education." → beneficial, facilitate, enhance
- "Many people think this is bad." → detrimental, a significant number of, contend
- "The government should do something." → implement measures, address the issue, take decisive action

After response: show the upgraded version + explain the improvement.
