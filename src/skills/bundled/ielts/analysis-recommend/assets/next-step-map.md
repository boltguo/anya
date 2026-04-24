# Next-Step Map

Problem-pattern → skill-callback mapping used by `analysis-recommend`. Deterministic: same input → same callback.

Organized by:

1. **Error recurrence_key** (from `analysis-weakness/assets/error-taxonomy.md`)
2. **Subcap key** (from `analysis-weakness/assets/subcap-catalog.md`)
3. **Behaviour pattern** (from `analysis-study/assets/consistency-rules.md`)

## By error recurrence_key

### Speaking

| Key | Go-to drill | Why |
| --- | ----------- | --- |
| `hesitation_breakdown` | `speaking-freetalk` | reduce pressure, build runtime |
| `filler_overuse` | `speaking-repeat` | scripted retell cuts fillers |
| `answer_too_short` / `answer_underdeveloped` | `speaking-repeat` (cue-card style) | forces fuller answers |
| `part2_structure_weak` | `speaking-repeat` + `speaking-exam` | narrative scaffolding |
| `part3_abstraction_gap` | `speaking-exam` (Part 3 focus) | practice societal framing |
| `vowel_confusion` / `consonant_cluster` / `word_stress` / `intonation` / `pronunciation_*` | `speaking-shadowing` | phoneme drill |
| `connected_speech_fail` | `speaking-shadowing` + `listening-shadowing` | co-train |
| `self_correction_fail` | `speaking-freetalk` + `speaking-explain` | look at transcripts |
| `register_mismatch` (speaking) | `speaking-roleplay` | scenario-specific register |

### Listening

| Key | Go-to drill |
| --- | ----------- |
| `minimal_pair_confusion` / `connected_speech_fail` | `listening-shadowing` or `listening-dictation` |
| `function_word_miss` / `spelling_error` / `missed_plural_s` | `listening-dictation` |
| `paraphrase_miss` | `listening-prediction` |
| `distractor_trap` | `listening-prediction` (grade predictions) + `listening-explain` |
| `number_confusion` | `listening-numberdrill` |
| `speaker_switch_confusion` | `listening-exam` (Section 3) |
| map-related misses | `listening-mapdrill` |
| `attitude_signal_miss` / `implied_meaning_fail` | `listening-shadowing` (with attitude clips) + `listening-explain` |
| `note_taking_breakdown` | `listening-exam` (Section 4) |

### Reading

| Key | Go-to drill |
| --- | ----------- |
| `tfng_logic_error` | `reading-typetrain` (type=TFNG) |
| `heading_mismatch` | `reading-typetrain` (type=Heading) |
| `sentence_anatomy_fail` | `reading-untimed` |
| `detail_location_fail` | `reading-timed` |
| `speed_too_slow` | `reading-skim-drill` first, then `reading-timed` |
| `inference_error` | `reading-untimed` (Phase 4) |
| `keyword_matching_error` | `reading-untimed` + `reading-typetrain` |
| `author_attitude_miss` / `argument_structure_miss` | `reading-untimed` |

### Writing

| Key | Go-to drill |
| --- | ----------- |
| `sv_agreement` / `tense_consistency` / `article_usage` / `clause_structure` / `parallel_structure` / `conditional_error` | `writing-sentence-drill` |
| `word_choice` / `collocation_error` / `word_form` / `word_choice_basic` | `writing-collocation` |
| `register_mismatch` / `formality_level` (writing) | `writing-task1-general` (GT) or `writing-rewrite` (upgrade register) |
| `paragraph_coherence` / `topic_sentence_weak` | `writing-guided` |
| `linking_devices` / `cohesion_missing` / `cohesion_overlinking` | `writing-rewrite` |
| `task_response_off_topic` | `writing-task2` + `writing-explain` |
| `task1_overview_missing` | `writing-task1-academic` |
| `task2_position_unclear` / `task2_counterargument_miss` | `writing-task2` |
| `argument_depth_weak` | `writing-task2` |
| `chinglish_transfer` | `writing-rewrite` + `writing-collocation` |
| `lexical_repetition_high` | `writing-collocation` + `vocab-topic` |

### Mechanics / pragmatics

| Key | Go-to drill |
| --- | ----------- |
| `spelling` (writing) | `writing-sentence-drill` (+ `vocab-review` for frequent offenders) |
| `punctuation` / `capitalization` | `writing-sentence-drill` |
| `hedging` / `directness` | `writing-rewrite` |

## By subcap key

When a subcap is `bottleneck_1` and no single error key dominates:

| Subcap | Go-to |
| ------ | ----- |
| `speaking.fluency_pauses` | `speaking-freetalk` |
| `speaking.pronunciation_intelligibility` | `speaking-shadowing` |
| `speaking.part2_structure` | `speaking-repeat` |
| `speaking.part3_abstraction` | `speaking-exam` |
| `speaking.lexical_variety` | `writing-collocation` or `vocab-topic` |
| `speaking.grammar_accuracy` | `writing-sentence-drill` (transfers) |
| `speaking.interaction` | `speaking-roleplay` |
| `listening.connected_speech` | `listening-dictation` |
| `listening.academic_vocab` | `vocab-topic` |
| `listening.discourse_marker` | `listening-shadowing` |
| `listening.implied_meaning` | `listening-prediction` |
| `listening.note_taking_stability` | `listening-exam` (Section 4) |
| `reading.sentence_anatomy` | `reading-untimed` |
| `reading.gist` | `reading-skim-drill` |
| `reading.paraphrase_mapping` | `reading-untimed` + `vocab-review` (paraphrase groups) |
| `reading.author_attitude` | `reading-typetrain` (MCQ-stance) |
| `reading.argument_structure` | `reading-untimed` |
| `reading.pace` | `reading-timed` |
| `writing.task_response` | `writing-task2` |
| `writing.argument_depth` | `writing-task2` |
| `writing.cohesion_logic` | `writing-rewrite` |
| `writing.connector_density` | `writing-rewrite` |
| `writing.lexical_sophistication` | `writing-collocation` |
| `writing.chinglish_transfer` | `writing-rewrite` |
| `writing.grammar_accuracy` | `writing-sentence-drill` |

## By behaviour pattern (from analysis-study)

| Pattern | Go-to |
| ------- | ----- |
| `drifter` + `re_entry` | `vocab-review` (5) OR `listening-shadowing` (60 sec) |
| `sprinter` | suggest spreading load: `vocab-review` daily + `listening-dictation` alt days |
| `over-loaded` | `speaking-freetalk` OR `listening-shadowing` (warm-up) |
| `marathoner` + stable | progression — full mock in weakest skill |
| `balanced` + fires bottleneck | follow the bottleneck map above |

## Difficulty-bump variants (used by Rule 7 progression)

| Base callback | Harder variant |
| ------------- | -------------- |
| `speaking-freetalk` | `speaking-exam` |
| `speaking-shadowing` | `speaking-shadowing` (accent rotation on) |
| `listening-dictation` | `listening-exam` |
| `listening-shadowing` | `listening-shadowing` (AU / US accent) |
| `reading-timed` | `reading-exam` |
| `reading-skim-drill` | `reading-timed` |
| `writing-guided` | `writing-task2` |
| `writing-sentence-drill` | `writing-rewrite` |
| `vocab-review` | `vocab-testme` |

## Tie-breakers

When two patterns compete (e.g. a chronic error in speaking AND imbalance zero for writing):

1. Prefer the `exam_close` path if one applies.
2. Prefer the track the learner hasn't touched recently (load `speaking` if writing was just done).
3. Prefer `*-explain` skills if the learner is asking right after a session, otherwise prefer the drill skill.
