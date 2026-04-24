# Error Taxonomy

Standardized `recurrence_key` values for IELTS error classification.
All errors recorded by `data` MUST use a key from this taxonomy.

## Grammar (grammar)

| Key                  | Description                                        | Example                                    |
| -------------------- | -------------------------------------------------- | ------------------------------------------ |
| `sv_agreement`       | Subject-verb agreement mismatch                    | "The data shows" → "The data show"         |
| `tense_consistency`  | Unnecessary tense shifts within a paragraph        | Past → present mid-sentence                |
| `article_usage`      | Missing, extra, or wrong article (a/an/the)        | "I went to university" vs "the university" |
| `clause_structure`   | Malformed relative/noun/adverbial clauses          | "The reason is because..."                 |
| `modal_misuse`       | Wrong modal verb or double modal                   | "He must can..."                           |
| `conditional_error`  | Wrong conditional structure or tense in if-clauses | "If I will go..." → "If I go..."           |
| `passive_misuse`     | Incorrect passive voice formation                  | "The book was wrote" → "was written"       |
| `parallel_structure` | Non-parallel items in a list or comparison         | "She likes reading, to swim, and cook"     |

## Lexical (lexical)

| Key                 | Description                                       | Example                           |
| ------------------- | ------------------------------------------------- | --------------------------------- |
| `word_choice`       | Wrong word for the intended meaning               | "economic" vs "economical"        |
| `collocation_error` | Unnatural word combination                        | "do a mistake" → "make a mistake" |
| `register_mismatch` | Too formal/informal for the context               | "kids" in academic writing        |
| `word_form`         | Wrong derivation (noun/verb/adj/adv)              | "success" → "successful"          |
| `word_choice_basic` | Over-reliance on basic vocabulary (good/bad/very) | "bad" → "detrimental"             |

## Discourse (discourse)

| Key                        | Description                                   | Example                             |
| -------------------------- | --------------------------------------------- | ----------------------------------- |
| `paragraph_coherence`      | Ideas within a paragraph don't flow logically | Random topic jumps                  |
| `topic_sentence`           | Missing or weak topic sentence                | Paragraph starts with a detail      |
| `topic_sentence_weak`      | Topic sentence present but vague or off-focus | "This paragraph is about education" |
| `linking_devices`          | Missing, overused, or misused connectors      | "Moreover" used incorrectly         |
| `cohesion_missing`         | Lack of cohesive devices between sentences    | Sentences feel disconnected         |
| `paragraph_structure_weak` | No clear TEEL/argument structure in paragraph | Missing example or explanation      |

## Writing-Specific (writing)

| Key                       | Description                                     | Example                                           |
| ------------------------- | ----------------------------------------------- | ------------------------------------------------- |
| `task_response_off_topic` | Essay doesn't address the prompt fully          | Discusses education when asked about health       |
| `example_vague`           | Supporting example is too generic or unspecific | "For example, many people think so"               |
| `task1_overview_missing`  | Task 1 lacks an overview/summary statement      | No overall trend mentioned                        |
| `task2_position_unclear`  | Opinion not clearly stated in Task 2            | Reader can't tell which side the writer supports  |
| `cohesion_overlinking`    | Overuse of linking words making text unnatural  | "Moreover, furthermore, additionally" in sequence |

## Pronunciation (pronunciation)

| Key                       | Description                            | Example                                           |
| ------------------------- | -------------------------------------- | ------------------------------------------------- |
| `vowel_confusion`         | Confusing similar vowels               | /ɪ/ vs /iː/ (ship/sheep)                          |
| `consonant_cluster`       | Dropping or adding sounds in clusters  | "strengths" → "strens"                            |
| `word_stress`             | Stress on wrong syllable               | "deSERT" (n) vs "deSERT" (v)                      |
| `intonation`              | Flat or wrong intonation patterns      | Statement intonation on questions                 |
| `pronunciation_stress`    | Sentence-level stress errors           | Stressing function words instead of content words |
| `pronunciation_vowel`     | Specific vowel sound errors            | /æ/ vs /e/ (bad/bed)                              |
| `pronunciation_consonant` | Specific consonant sound errors        | /θ/ vs /s/ (think/sink)                           |
| `connected_speech_fail`   | Cannot produce natural linking/elision | "pick it up" → "pi-ki-tup" not produced           |

## Speaking-Specific (speaking)

| Key                     | Description                                         | Example                                             |
| ----------------------- | --------------------------------------------------- | --------------------------------------------------- |
| `hesitation_breakdown`  | Extended pauses or complete breakdown mid-answer    | 5+ second silence, unable to continue               |
| `filler_overuse`        | Excessive use of fillers (um, uh, like, you know)   | "Um, like, you know, I think, um..."                |
| `answer_too_short`      | Response significantly below expected length        | Part 2 answer under 30 seconds                      |
| `answer_underdeveloped` | Ideas present but not expanded with detail/example  | "I like it because it's good"                       |
| `part3_abstraction_gap` | Cannot discuss abstract/societal topics             | Gives personal anecdote instead of general analysis |
| `self_correction_fail`  | Attempts self-correction but produces another error | "He goed... he wented..."                           |

## Listening-Specific (listening)

| Key                        | Description                                              | Example                                        |
| -------------------------- | -------------------------------------------------------- | ---------------------------------------------- |
| `minimal_pair_confusion`   | Confusing words that differ by one sound                 | "ship" vs "sheep", "bad" vs "bed"              |
| `function_word_miss`       | Missing articles, prepositions, auxiliaries in dictation | "at the" heard as "at"                         |
| `paraphrase_miss`          | Fails to recognize synonym/paraphrase in questions       | "essential" in audio = "necessary" in question |
| `distractor_trap`          | Selects answer mentioned but later corrected/qualified   | Speaker says "Tuesday... no, Wednesday"        |
| `spelling_error`           | Correct word heard but misspelled in answer              | "recieve" → "receive"                          |
| `missed_plural_s`          | Misses plural -s or third person -s                      | "books" heard as "book"                        |
| `number_confusion`         | Confuses similar numbers                                 | "fifteen" vs "fifty", "30" vs "13"             |
| `speaker_switch_confusion` | Attributes information to wrong speaker                  | Confuses Speaker A and Speaker B opinions      |

## Reading-Specific (reading)

| Key                      | Description                                            | Example                                                 |
| ------------------------ | ------------------------------------------------------ | ------------------------------------------------------- |
| `tfng_logic_error`       | Wrong T/F/NG judgment due to logic confusion           | Confuses "some" (partial) with "the majority" (most)    |
| `heading_mismatch`       | Selects wrong heading for paragraph                    | Picks detail-level heading instead of main idea         |
| `sentence_anatomy_fail`  | Cannot parse complex sentence structure                | Misidentifies subject/object in relative clauses        |
| `detail_location_fail`   | Cannot locate specific information in passage          | Scans wrong paragraph for the answer                    |
| `speed_too_slow`         | Reading pace too slow for timed conditions             | Cannot finish passage within time limit                 |
| `inference_error`        | Incorrect inference from passage information           | Over-interprets or under-interprets implied meaning     |
| `keyword_matching_error` | Matches surface keywords without understanding context | Selects answer because it contains same word as passage |

## Mechanics (mechanics)

| Key              | Description                  | Example                      |
| ---------------- | ---------------------------- | ---------------------------- |
| `spelling`       | Misspelled words             | "recieve" → "receive"        |
| `punctuation`    | Wrong or missing punctuation | Missing comma before "which" |
| `capitalization` | Incorrect capitalization     | "english" → "English"        |

## Pragmatics (pragmatics)

| Key               | Description                         | Example                        |
| ----------------- | ----------------------------------- | ------------------------------ |
| `formality_level` | Wrong register for the task type    | Too casual in Task 2           |
| `hedging`         | Missing hedging in academic writing | "This will..." → "This may..." |
| `directness`      | Too direct or too indirect          | Missing softeners              |

---

## Chinese L1 Transfer (chinglish)

Errors rooted in systematic Chinese-English language transfer (PRD §4B). Tracked as a distinct category for targeted remediation.

| Key | Description | Example |
| --- | --- | --- |
| `chinglish_transfer` | Topic-comment structure, zero article, or other Chinese-influenced syntax | "This problem, we should solve it" |
| `article_system` | Systematic article misuse beyond single slips (a/the/Ø pattern) | Consistent missing "the" before superlatives |
| `modal_flat` | Insufficient should/could/might/may distinction; flat modal usage | "We should..." for every hedging context |
| `connector_overload` | Excessive furthermore/moreover/additionally stacking | "Moreover, furthermore, in addition…" in one paragraph |
| `lexical_repetition_high` | Same word/phrase reused 3+ times where paraphrase is expected | "important" × 5 in a single essay |
| `self_correction_loop` | Repeated mid-sentence self-corrections that break fluency rhythm | "He goed… he went… he was going…" |

## Advanced Writing (writing_advanced)

Higher-order writing errors that block 6.5 → 7+ progression.

| Key | Description | Example |
| --- | --- | --- |
| `argument_depth_weak` | Supporting ideas left as assertions without specifics | "Education is important because it helps people" (no data, no example) |
| `task2_counterargument_miss` | Discussion essay fails to address the opposing view | Only argues one side in a "discuss both views" prompt |

## Advanced Speaking (speaking_advanced)

Structure and abstraction gaps relevant to Part 2/3 scoring.

| Key | Description | Example |
| --- | --- | --- |
| `part2_structure_weak` | Cue Card response lacks story skeleton (setting/character/conflict/resolution/feeling) | Rambles without a clear narrative arc |
| `part3_abstraction_gap` | Cannot discuss abstract/societal topics; falls back to personal anecdote | "In my opinion my friend also thinks so" instead of analyzing a trend |

## Advanced Listening (listening_advanced)

Cognitive-process errors beyond surface-level mishearing.

| Key | Description | Example |
| --- | --- | --- |
| `attitude_signal_miss` | Fails to catch speaker's stance from discourse markers or tone | Misses "I'm afraid" as a softened disagreement |
| `implied_meaning_fail` | Cannot infer unstated meaning from context or hedging | Takes "That's one way of looking at it" as agreement |
| `note_taking_breakdown` | Information anchors lost due to note-taking overload or strategy failure | Writes too much detail, misses the next key point |

## Advanced Reading (reading_advanced)

Higher-order comprehension errors beyond word/sentence level.

| Key | Description | Example |
| --- | --- | --- |
| `author_attitude_miss` | Cannot detect author stance through lexical cues (hedging, emphasis, irony) | Misreads "arguably" as a neutral statement |
| `argument_structure_miss` | Fails to map claim → support → counter-argument relationships | Cannot identify which paragraph refutes the main thesis |

---

## Root Cause Tags

Every `recurrence_key` should be tagged with one root cause when recorded in `errors`:

| Root Cause | Tag | Covers |
| --- | --- | --- |
| Language | `root:language` | Vocab, grammar, phonetics — the learner doesn't know it yet |
| Cognitive | `root:cognitive` | The learner knows it but fails under processing load |
| Strategy | `root:strategy` | Wrong test-taking or time-management approach |

---

## Maintenance

- Review this taxonomy monthly
- New keys require adding to this file first, then using in tracker
- Retired keys should be marked as `[DEPRECATED]` but never deleted (historical data references them)
- Root cause tags should be applied when errors are inserted into the `errors` table
