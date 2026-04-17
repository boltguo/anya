# Sentence Lab Mode — C→E Micro-Translation & Sentence Upgrade

## Pedagogical Foundation

- **Lewis Lexical Approach**: Chunk-based acquisition through sentence patterns
- **Schmidt Noticing Hypothesis**: Contrastive comparison forces noticing of L1-L2 gaps
- **PRD §4B**: Direct counter to chinglish transfer through structured C→E translation

## When to Use

- `writing:sentlab` callback
- Auto-suggested when `chinglish_transfer`, `lexical_repetition_high`, or `word_choice_basic` in recent errors
- Good for low daily load budget (load_score = 2)
- Ideal for fragmented study time (10-15 minutes)

## Load Score: 2

## Protocol

### S3 — Task Selection (pick ONE type per session)

**Type A — C→E Micro-Translation (5 sentences)**

Generate 5 Chinese sentences related to recent IELTS topics. Each should:
- Target a common chinglish pattern (topic-comment, zero article, modal flattening)
- Be 15-25 words when properly translated
- Progress from simple → complex

```
tg(type:"force_reply", text:"把下面的中文翻译成英文：\n\n1. 这个问题，我们必须认真对待。\n2. 教育对一个国家的发展很重要。\n3. 虽然科技带来了便利，但是也造成了一些问题。\n4. 政府应该采取措施来解决环境污染。\n5. 随着社会的发展，人们越来越重视健康。")
```

**Type B — 6→7 Sentence Upgrade (5 sentences)**

Present 5 band-6.0 level sentences. Learner must upgrade each to band 7.0+:
- Replace basic vocabulary with precise alternatives
- Add AWL words where appropriate
- Improve sentence structure variety
- Fix any grammar issues

```
tg(type:"force_reply", text:"把下面的句子升级到 7 分水平：\n\n1. This is bad for the environment.\n2. Many people think education is important.\n3. The government should do something about this problem.\n4. Technology has good and bad effects on society.\n5. More and more people are using the internet.")
```

### S4 — Sentence-by-Sentence Feedback

For each sentence:

1. Show the learner's version
2. Show an improved version with diff markers:

```
❌ "~This problem, we must treat it seriously.~"
✅ "**We must take this issue seriously.**"
📝 Issue: topic-comment structure (chinglish_transfer) → Use SVO order
```

3. Tag errors using taxonomy keys:
   - `chinglish_transfer`
   - `article_system`
   - `modal_flat`
   - `connector_overload`
   - `word_choice_basic`
   - `lexical_repetition_high`

### S5 — Noticing Drill

Pick the 2 worst sentences and force a redo:

```
tg(type:"force_reply", text:"重新翻译第 {{n}} 句，注意 {{specific_issue}}")
```

If the redo is correct → `tg(type:"react", emoji:"👍")`
If still wrong → show the model, explain once, move on.

### S6-S10 — Use Shared Steps

Continue with shared S6-S10 from the main SKILL.md. For sentence-lab:
- S6 scoring focuses on `writing.chinglish_transfer`, `writing.lexical_sophistication`, `writing.grammar_accuracy`
- S9 Forced Rewrite: redo all 5 sentences incorporating feedback
- Auto-harvest any good upgraded expressions as chunks into vocab.db

## AWL Tracking

For Type B (Sentence Upgrade), count how many AWL words the learner successfully used:
- 0-1 AWL: "Try incorporating words like 'significant', 'contribute', 'factor'"
- 2-3 AWL: "Good start! Keep expanding your academic vocabulary"
- 4-5 AWL: "Excellent AWL coverage!"

Record AWL count in `subcap_scores` evidence field for `writing.lexical_sophistication`.
