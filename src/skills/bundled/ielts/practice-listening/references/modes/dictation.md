# Mode: Dictation 听写

> Band 4.5-6.0 | 3-5 sentences per session

Use when function-word or sentence-structure errors are frequent. Schedule at least 1 dictation session per week regardless of level.

## S3 — Select Sentence

By band:

- Band 4.5-5.0: 8-12 words, simple structure
- Band 5.0-5.5: 12-18 words, one subordinate clause
- Band 5.5-6.0: 18-25 words, academic sentence

## S4 — First Listen

```
tts(text:"<target sentence>")
```

Natural speed, played once only.

```
tg(type:"force_reply", text:"写出你听到的完整句子")
```

## S5 — Word-by-Word Diff

Compare the user's transcription with the original. Classify errors:

- **Spelling**: correct word, wrong spelling
- **Function word miss**: articles, prepositions, auxiliaries dropped
- **Structure error**: wrong word order, words added/removed

Show a highlighted diff:

```
📝 对比结果:
The library ~close~→**closes** at ~6~→**six** o'clock
⚠️ 注意: closes 第三人称单数 -s | 雅思听力要求 six 拼写
```

## S6 — Second Listen

```
tts(text:"<target sentence>")
```

```
tg(type:"force_reply", text:"再听一次，补充你漏掉的部分")
```

## S7 — Final Feedback

Show the correct full text + key difficulty points.

If the sentence involves paraphrase (synonym substitution):

```
tg(type:"quiz", text:"录音里的 essential 和题目的 necessary 是完美替换还是有差别？", options:["完美替换", "有细微差别"], correct:0)
```

## S8 — Micro Drill (Paraphrase)

If paraphrase was involved: quiz on the synonym pair.
Otherwise: replay the hardest segment for one more transcription.

## S9 — Forced Redo

Learner re-transcribes the sentence one final time.

## S10 — Record (after 3-5 sentences)

```
db name=learner sql="INSERT INTO samples (created_at, skill_type, prompt, band_overall, session_id, feedback) VALUES (datetime('now'), 'listening', 'dictation', ?, ?, ?)" params='[null, "<session_id>", "<feedback>"]'
```

Record errors: `function_word_miss`, `spelling_error`, `connected_speech_fail`, etc.

Difficulty feedback keyboard.
