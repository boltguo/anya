# Canonical Error Keys

Every `errors.recurrence_key` **must** come from this list. The canonical source
is the `error_keys` table in `study.db`, seeded from `src/storage/study/study.sql`.
Skills that send unknown keys: the `persist` tool drops them and returns the
rejected keys in `unknown_error_keys` — fix the skill, do not invent variants.

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
| `sentence_fragment` | Incomplete sentence |
| `run_on_sentence` | Two independent clauses without proper conjunction |
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
| `pronunciation_vowel` | Vowel articulation unstable |
| `pronunciation_consonant` | Consonant / word-final articulation unclear |
| `pronunciation_stress` | Word- or sentence-stress placed incorrectly |
| `consonant_cluster` | Consonant cluster simplified or mispronounced |
| `intonation` | Intonation contour wrong for the utterance type |
| `vocabulary_repetition` | Reused the same word/phrase excessively |
| `response_too_short` | Answer lacked development or detail |
| `info_loss` | Key information dropped in retell / paraphrase |
| `paraphrase_parroting` | Echoed source verbatim instead of paraphrasing |
| `role_break` | Stepped out of the assigned role in roleplay |
| `register_too_formal` | Register too formal for the scenario |
| `register_too_casual` | Register too casual for the scenario |
| `politeness_error` | Politeness marker missing or mis-pitched |
| `function_incomplete` | Conversational function not completed (apology missing the actual apology, etc.) |

## Grammar (cross-skill)

| Key | Description |
|-----|-------------|
| `article_usage` | a/an/the errors |
| `verb_form_error` | Tense, agreement, gerund/infinitive |
| `preposition_error` | Wrong preposition |
| `plural_miss` | Singular/plural confusion |
| `word_form_error` | Wrong part of speech |
| `word_order_error` | Non-standard word order |
| `relative_clause_error` | Incorrect who/which/that usage |

## Vocabulary (cross-skill)

| Key | Description |
|-----|-------------|
| `lexical_substitution` | Used a wrong but related word |
| `collocation_error` | Unnatural word pairing |
| `false_friend` | L1-influenced wrong word choice |
| `register_mismatch` | Word too formal/informal for context |
