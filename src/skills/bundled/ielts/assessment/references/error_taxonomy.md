# Error Taxonomy

Standardized `recurrence_key` values for IELTS error classification.
All errors recorded by `data` MUST use a key from this taxonomy.

## Grammar (grammar)

| Key | Description | Example |
|---|---|---|
| `sv_agreement` | Subject-verb agreement mismatch | "The data shows" → "The data show" |
| `tense_consistency` | Unnecessary tense shifts within a paragraph | Past → present mid-sentence |
| `article_usage` | Missing, extra, or wrong article (a/an/the) | "I went to university" vs "the university" |
| `clause_structure` | Malformed relative/noun/adverbial clauses | "The reason is because..." |
| `modal_misuse` | Wrong modal verb or double modal | "He must can..." |

## Lexical (lexical)

| Key | Description | Example |
|---|---|---|
| `word_choice` | Wrong word for the intended meaning | "economic" vs "economical" |
| `collocation_error` | Unnatural word combination | "do a mistake" → "make a mistake" |
| `register_mismatch` | Too formal/informal for the context | "kids" in academic writing |
| `word_form` | Wrong derivation (noun/verb/adj/adv) | "success" → "successful" |

## Discourse (discourse)

| Key | Description | Example |
|---|---|---|
| `paragraph_coherence` | Ideas within a paragraph don't flow logically | Random topic jumps |
| `topic_sentence` | Missing or weak topic sentence | Paragraph starts with a detail |
| `linking_devices` | Missing, overused, or misused connectors | "Moreover" used incorrectly |

## Mechanics (mechanics)

| Key | Description | Example |
|---|---|---|
| `spelling` | Misspelled words | "recieve" → "receive" |
| `punctuation` | Wrong or missing punctuation | Missing comma before "which" |
| `capitalization` | Incorrect capitalization | "english" → "English" |

## Pronunciation (pronunciation)

| Key | Description | Example |
|---|---|---|
| `vowel_confusion` | Confusing similar vowels | /ɪ/ vs /iː/ (ship/sheep) |
| `consonant_cluster` | Dropping or adding sounds in clusters | "strengths" → "strens" |
| `word_stress` | Stress on wrong syllable | "deSERT" (n) vs "deSERT" (v) |
| `intonation` | Flat or wrong intonation patterns | Statement intonation on questions |

## Pragmatics (pragmatics)

| Key | Description | Example |
|---|---|---|
| `formality_level` | Wrong register for the task type | Too casual in Task 2 |
| `hedging` | Missing hedging in academic writing | "This will..." → "This may..." |
| `directness` | Too direct or too indirect | Missing softeners |

---

## Maintenance

- Review this taxonomy monthly
- New keys require adding to this file first, then using in tracker
- Retired keys should be marked as `[DEPRECATED]` but never deleted (historical data references them)
