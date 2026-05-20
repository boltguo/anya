# Vocabulary Harvest — host-skill side-effect protocol

`vocab-harvest` used to be a standalone skill. In v3 it's downgraded to **a
side-effect contract** that other skills follow when they end a practice that
exposed the learner to high-value vocabulary.

There is **no separate skill to invoke and no callback button**. The host
skill (reading-deepdive, writing-rewrite, listening-podcast, the user typing
"save this word") writes vocab rows directly via `persist action="word_upsert"`
after its own State D persist.

## When the host skill should harvest

| Host | Trigger | Target count |
|------|---------|--------------|
| `reading-deepdive` | End of every passage | 2–3 collocations / chunks (not common single words) |
| `writing-rewrite` | After model rewrite is shown | 1 highest-leverage chunk |
| `listening-podcast` | If user comprehension was ≥ 0.7 | 1–2 phrasal chunks from transcript |
| `error-clinic` | When learner asks "save this as a personal-error card" | 1 personal_error item |
| User explicit lookup ("查词", "存起来", "add to flashcards") | Immediate | 1 word |

## Selection criteria

Pick items the learner is **unlikely to know** at their tier but **likely to
encounter again**. Bias toward:

- Multi-word expressions (collocations / phrasal verbs) over single common words
- Discourse-functional chunks (`it is widely argued that`, `to a certain extent`)
- Domain-specific vocabulary from `USER.md` interests
- Personal-error items from `error-clinic` (item_kind=`personal_error`)

Skip:

- Words already at `mastery='known'` or `mastery='mastered'` (look up via `persist action="word_lookup"`)
- Dictionary "general" words below the learner's tier (a B1 learner doesn't need `interesting` harvested)

## Persist shape

```json
{
  "action": "word_upsert",
  "word": "shoulder the cost",
  "item_kind": "chunk",
  "chinese": "承担成本",
  "ipa": "",
  "pos": "verb-phrase",
  "example_en": "<the exact sentence from the host context — never a generic dictionary example>",
  "mastery": "queued_new",
  "is_user_word": 0,
  "origin": "reading.deepdive",
  "topics": "<comma list or JSON array; only when the host material is topic-tagged>",
  "source_sample_id": <the parent practice sample id>
}
```

## Hard rules

1. **Silent**: never tell the user "I added words to your list" in the host's reply. The vocab side-effect is invisible.
2. **Anchor the example**: `example_en` MUST be the exact sentence the learner just saw, not a generic dictionary line.
3. **Item kind matters**: `chunk` for multi-word, `pattern` for sentence frames, `word` for single words, `personal_error` for mistake cards.
4. **`origin`** identifies the host skill so we can trace where each item came from.
5. **No batch UX**: the harvest never opens its own conversation turn. It happens silently inside the host's State D.
6. **Dedup is cheap**: `word_upsert`'s `ON CONFLICT(word)` already de-dups; no need to call `word_lookup` first unless you want to skip the call entirely.
