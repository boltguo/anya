# Vocab Review — Card Templates (per item_kind)

All cards end with the 3-button rating keyboard:

```
[KEYBOARD:
✅ 会了=word_known | 🤔 模糊=word_vague | ❌ 不会=word_unknown
]
```

## Word

```
tg_msg(type:"voice", url:"<audio_path>")   # if available
```
Then:
```
📚 **{{word}}**
/{{ipa}}/  · {{pos}}

意思: <tg-spoiler>{{chinese}} — {{definition}}</tg-spoiler>

例: {{example_en}}
```

## Chunk

```
📚 **{{chunk}}**

类型: 搭配短语
意思: <tg-spoiler>{{chinese}} — {{definition}}</tg-spoiler>

框架: {{frame}}
示例:
- "{{example_1}}"
- "{{example_2}}"
```

## Pattern

```
📚 **{{pattern}}**  (句型)

用法: {{how_used}}
示例:
- "{{example_1}}"
- "{{example_2}}"
```

Optional production check:
```
tg_msg(type:"text", text:"用这个句型造一个你自己的句子")
```

## Paraphrase group

```
📚 **同义组: {{topic}}**

| 表达 | 语域 | 示例 |
|---|---|---|
| {{m1}} | {{r1}} | {{ex1}} |
| {{m2}} | {{r2}} | {{ex2}} |
| {{m3}} | {{r3}} | {{ex3}} |
```

Quiz:
```
tg_msg(type:"quiz", text:"\"{{topic_sentence}}\" 填哪个更合适？", options:"[...]", correct:<n>)
```

## Personal error

```
📚 **易错纠正**

❌ 你曾经写过: "{{wrong}}"
✅ 正确: "{{correct}}"
原因: {{why}}
```

Quick quiz:
```
tg_msg(type:"quiz", text:"现在看，哪个是正确的？", options:"[\"{{wrong}}\",\"{{correct}}\"]", correct:1)
```

## Wrap

```
✅ 复习完成 {{total}} 项
- 会了 {{known_n}}
- 模糊 {{vague_n}}
- 不会 {{unknown_n}}

下次到期: {{next_due}}
```

Keyboard: `[🔁 继续复习|vocab-review]  [🧠 考考我|vocab-testme]  [📖 题源抽词|vocab-contextual]  [🏠 主菜单|nav:main]`
