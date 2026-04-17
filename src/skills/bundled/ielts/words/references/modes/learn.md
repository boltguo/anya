# Mode B — Learn

Use when the learner says "背单词" or enters the words skill from the main menu.

## Workflow

1. `memory target=memory action=read` for level and weak areas.
2. Prefer this queue order:
   - due review word
   - otherwise one `queued_new` word
3. Before selecting a new word, ensure inventory is healthy:

```
db name=vocab sql="SELECT COUNT(*) AS queued_new_count FROM words WHERE mastery = 'queued_new'"
```

4. If `queued_new_count < 5`, batch-generate 5 words first.
5. Show only one card at a time.

## New Word Card

For `mastery='queued_new'`, send audio first (see `references/audio.md`), then:

```text
📚 <b><word></b>  <code><ipa></code>

<tg-spoiler>
<pos>. <chinese>
<definition>
<example_en>
<example_cn>
</tg-spoiler>

[KEYBOARD:
✅ 认识=word_known | 🤔 模糊=word_vague | ❌ 不认识=word_unknown
💾 加入生词本=word_save | 🔄 下一个=word_next
]
```

## First Response Handling

### `word_known` — learner basically knows the meaning

Update:

- `mastery='learning'`
- `transfer_level=max(transfer_level,2)`
- `introduced_at=datetime('now')` if null
- `srs_interval=1`
- `srs_due=datetime('now','+1 day')`
- `review_count=review_count+1`
- `success_count=success_count+1`
- `last_result='known'`

Then do one collocation or meaning check.

### `word_vague` — learner has partial familiarity

Reveal meaning, replay audio, give one quick usage note.

Update:

- `mastery='learning'`
- `transfer_level=max(transfer_level,1)`
- `introduced_at=datetime('now')` if null
- `srs_interval=0`
- `srs_due=datetime('now','+8 hours')`
- `review_count=review_count+1`
- `fail_count=fail_count+1`
- `last_result='vague'`

Then do one collocation or meaning check.

### `word_unknown` — learner doesn't know it

Do short teaching:

- root or synonym
- one usage warning
- replay slower audio

Update:

- `mastery='learning'`
- `transfer_level=1`
- `introduced_at=datetime('now')` if null
- `srs_interval=0`
- `srs_due=datetime('now','+2 hours')`
- `review_count=review_count+1`
- `fail_count=fail_count+1`
- `last_result='unknown'`

Then do one collocation or meaning check.

### `word_next` — skip without promotion

Record `event_type='skip'`. Move to next word.

## Mandatory Follow-up Check

Newly introduced words must get one small active check. Use one of:

- meaning quiz
- collocation fill-in
- choose-the-best-sentence

Example:

```
tg(type:"quiz", text:"___ consequence", options:"[\"inevitable\",\"unavoidable\",\"certain\",\"absolute\"]", correct:0)
```

## Event Logging

Always write the event after learner interaction:

```
db name=vocab sql="INSERT INTO word_events (word, event_type, session_type, context, created_at) VALUES (?, ?, 'words', ?, datetime('now'))" params='["<word>", "<known|vague|unknown|quiz_correct|quiz_wrong|skip>", "..."]'
```
