# Canonical Error Keys

Every `errors.recurrence_key` **must** come from this list.  
Do NOT invent new keys. If an error doesn't fit, use the closest match + explain in `rule_note`.

## Listening

| Key | Description |
|-----|-------------|
| `function_word_miss` | Missed article, preposition, pronoun, or auxiliary |
| `connected_speech_fail` | Failed to decode elision, assimilation, or linking |
| `number_confusion` | Mixed up -teen/-ty, dates, times, phone digits |
| `spelling_error` | Wrote the wrong spelling for a correctly heard word |
| `word_substitution` | Replaced a word with a similar-sounding one |
| `tense_miss` | Missed verb tense marker (-ed, -s, will, etc.) |
| `plural_miss` | Missed plural -s/-es ending |

## Reading

| Key | Description |
|-----|-------------|
| `tfng_logic_error` | Confused TRUE/FALSE/NOT GIVEN reasoning |
| `heading_mismatch` | Chose wrong heading for a paragraph |
| `keyword_matching_error` | Matched surface keywords instead of meaning |
| `inference_error` | Drew incorrect inference from text |
| `detail_location_fail` | Could not locate the relevant detail in the passage |
| `paraphrase_miss` | Failed to recognize a paraphrase of the question |
| `time_pressure_skip` | Skipped or guessed due to time running out |

## Writing

| Key | Description |
|-----|-------------|
| `article_usage` | Incorrect or missing a/an/the |
| `verb_form_error` | Wrong tense, aspect, or subject-verb agreement |
| `preposition_error` | Wrong preposition choice |
| `sentence_fragment` | Incomplete sentence |
| `run_on_sentence` | Two independent clauses without proper conjunction |
| `word_form_error` | Wrong part of speech (e.g. noun instead of adjective) |
| `collocation_error` | Unnatural word combination |
| `coherence_gap` | Missing or weak logical connector between ideas |
| `register_mismatch` | Tone too informal/formal for the task |
| `task_incomplete` | Did not address all parts of the prompt |

## Speaking

| Key | Description |
|-----|-------------|
| `filler_overuse` | Excessive uh/um/you know/like |
| `self_correction_loop` | Repeated self-corrections disrupting flow |
| `l1_transfer` | Mother-tongue grammar pattern in English |
| `pronunciation_error` | Systematic mispronunciation |
| `register_mismatch` | Tone inappropriate for the scenario |
| `vocabulary_repetition` | Reused the same word/phrase excessively |
| `response_too_short` | Answer lacked development or detail |

## Grammar (cross-skill)

| Key | Description |
|-----|-------------|
| `article_usage` | a/an/the errors |
| `verb_form_error` | Tense, agreement, gerund/infinitive |
| `preposition_error` | Wrong preposition |
| `plural_miss` | Singular/plural confusion |
| `word_order_error` | Non-standard word order |
| `relative_clause_error` | Incorrect who/which/that usage |

## Vocabulary (cross-skill)

| Key | Description |
|-----|-------------|
| `lexical_substitution` | Used a wrong but related word |
| `collocation_error` | Unnatural word pairing |
| `false_friend` | L1-influenced wrong word choice |
| `register_mismatch` | Word too formal/informal for context |
