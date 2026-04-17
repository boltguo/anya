# Mode C — Review

Use when the learner taps `word_review` or a review word is selected first in Learn mode.

## Pull Rule

Only already introduced words are eligible:

```
db name=vocab sql="SELECT word, chinese, ipa, pos, example_en, example_cn, audio_path, transfer_level, srs_interval, srs_ease, review_count, success_count, fail_count FROM words WHERE mastery IN ('learning','known') AND srs_due IS NOT NULL AND srs_due <= datetime('now') ORDER BY is_user_word DESC, priority DESC, srs_due ASC LIMIT 5"
```

Never generate a brand-new word here.

## Review Card

Send audio first (see `references/audio.md`), then a lighter card:

```text
📝 <b><word></b>  <code><ipa></code>
<b>词性</b>: <pos>
<tg-spoiler><chinese> | <definition></tg-spoiler>
<b>例句</b>: <example_en>

[KEYBOARD:
✅ 会了=word_known | 🤔 不稳=word_vague | ❌ 忘了=word_unknown
🔄 下一个=word_next | 🏠 返回=menu
]
```

## Review Update Rules

### `word_known`

- `review_count + 1`
- `success_count + 1`
- `last_result='review_pass'`
- `srs_interval = CASE WHEN srs_interval < 1 THEN 1 ELSE srs_interval * 2 END`
- `srs_due = datetime('now', '+' || srs_interval || ' days')`
- if stable enough, allow `mastery='known'`

### `word_vague`

- `review_count + 1`
- `fail_count + 1`
- `last_result='review_soft_fail'`
- `srs_due=datetime('now','+12 hours')`
- keep `mastery='learning'`

### `word_unknown`

- `review_count + 1`
- `fail_count + 1`
- `last_result='review_fail'`
- `srs_interval=0`
- `srs_due=datetime('now','+4 hours')`
- keep `mastery='learning'`
- replay full detail and example

### `word_next`

- no promotion
- `last_result='review_skip'`

## Telegram Interaction

Prefer Telegram-native interaction over long text:

- `tg(type:"quiz")` for meaning / collocation
- spoiler for answer reveal
- inline keyboard for self-rating
- short follow-up message rather than long paragraph correction
