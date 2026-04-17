# Mode: Sentence Anatomy 长难句解剖

Triggered after wrong answers in Standard Practice, or via `reading_anatomy` callback.

## S3 — Extract Problem Sentence

From the wrong answer, extract the long/complex sentence that caused the error.

## S4 — Display + Socratic Questioning

Show the sentence with clause layers annotated:

```
📝 来解剖这个长难句:

"The policy, [which was largely ignored by local authorities], resulted in significant changes [that affected millions of residents]."
```

First question (force_reply):

```
tg(type:"force_reply", text:"'which was largely ignored' 修饰的是谁？")
```

## S5 — Evaluate + Guide

**Correct** → progress to deeper question:

```
tg(type:"force_reply", text:"整个句子的主语和核心谓语是什么？")
```

**Wrong** → give a hint:

```
tg(type:"force_reply", text:"试试把 which 从句去掉，剩下的部分是什么？")
```

## S6 — T/F/NG Logic Probe (if applicable)

If the original error was T/F/NG:

```
tg(type:"quiz", text:"题目用的是 'some'，原文用的是 'the majority'\n它们是绝对矛盾还是包含关系？", options:["绝对矛盾 (False)", "包含关系 (Not Given)"], correct:1)
```

## S7-S9 — Feedback + Redo

Explain the logic, then have the learner re-answer the original question.

## S10 — Record

Record the error with `sentence_anatomy_fail` or `tfng_logic_error` taxonomy key.
