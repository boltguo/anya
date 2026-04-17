# Sub-Capability Catalog

Canonical keys for the `subcap_scores` table. Every `subcap_key` written to the database **must** come from this list.

Scores use the 0.0–9.0 IELTS band scale. Assessment aggregates these into radar charts and root-cause analysis.

---

## Writing (7 keys)

| Key | Description | Aligned IELTS Criterion |
|---|---|---|
| `writing.task_response` | Addresses the prompt; clear position; adequate length | Task Response / Achievement |
| `writing.argument_depth` | Supporting ideas developed with specifics, not left as assertions | Task Response |
| `writing.cohesion_logic` | Paragraph-internal logical flow; TEEL/PEEL structure closure | Coherence & Cohesion |
| `writing.connector_density` | Appropriate linking — detects both under-use and **connector overload** | Coherence & Cohesion |
| `writing.lexical_sophistication` | Vocabulary range + AWL coverage rate; uses precise, less-common items | Lexical Resource |
| `writing.chinglish_transfer` | Absence of Chinese-influenced structures (topic-comment, zero article, modal flattening) | Grammar Range & Accuracy |
| `writing.grammar_accuracy` | Error density (articles, tense, S-V agreement, clause structure) | Grammar Range & Accuracy |

## Speaking (7 keys)

| Key | Description | Aligned IELTS Criterion |
|---|---|---|
| `speaking.fluency_pauses` | Pause density, filler frequency, self-correction loop rate | Fluency & Coherence |
| `speaking.pronunciation_intelligibility` | Phoneme accuracy, word stress, connected-speech production | Pronunciation |
| `speaking.part2_structure` | Story five-element coverage: setting / character / conflict / resolution / feeling | Fluency & Coherence |
| `speaking.part3_abstraction` | Can discuss societal / abstract topics with OEE (Opinion-Explanation-Example) structure | Fluency & Coherence |
| `speaking.lexical_variety` | Inverse of repetition rate; ability to paraphrase and use less-common vocabulary | Lexical Resource |
| `speaking.grammar_accuracy` | Range and accuracy of grammatical structures in spontaneous speech | Grammatical Range & Accuracy |
| `speaking.interaction` | Responsiveness to follow-up questions; ability to extend and negotiate meaning | Fluency & Coherence |

## Listening (5 keys)

| Key | Description | Assessed Via |
|---|---|---|
| `listening.connected_speech` | Recognition of linking, elision, assimilation, and weak forms | Sound Drill / Dictation error analysis |
| `listening.academic_vocab` | Hearing and mapping academic vocabulary at natural speed | Dictation / Lecture comprehension |
| `listening.discourse_marker` | Catching discourse markers that signal turn, contrast, concession, or attitude | Short Clip / Lecture sub-tasks |
| `listening.implied_meaning` | Inferring unstated meaning from tone, context, or hedging | Lecture / Short Clip comprehension Qs |
| `listening.note_taking_stability` | Consistent capture of key information anchors while listening continues | Note-Taking mode (Phase 3) |

## Reading (6 keys)

| Key | Description | Assessed Via |
|---|---|---|
| `reading.sentence_anatomy` | Extracting main clause / subject / verb in complex sentences | Sentence Anatomy mode |
| `reading.gist` | Identifying paragraph main idea accurately | All modes — heading-match & gist Qs |
| `reading.paraphrase_mapping` | Recognizing synonyms / paraphrases between passage and question | Standard Practice — paraphrase Qs |
| `reading.author_attitude` | Detecting author stance through lexical cues (hedging, emphasis) | Attitude-Scan mode (Phase 3) |
| `reading.argument_structure` | Understanding claim → support → counter-argument relationships | Argument-Map mode (Phase 3) |
| `reading.pace` | Timed reading stability: able to skim ≥ 250 wpm, detail-read ≥ 180 wpm under exam pressure | Flash-Skim / Timed Exam |

---

## Scoring Guidelines

- **7.0–9.0**: Consistently competent; minor slips only.
- **5.5–6.5**: Partially effective; noticeable errors but does not impede communication.
- **4.0–5.0**: Limited; frequent errors affect comprehension.
- **< 4.0**: Extremely limited; fundamental capability gap.

## Stability Metrics (computed by assessment, not stored per subcap)

- `band_mean`: EMA-smoothed mean of recent subcap scores (α = 0.3)
- `band_std`: Standard deviation over the last 10 scored samples
- `band_trough_7d`: Lowest score in 7-day window
- `band_trough_30d`: Lowest score in 30-day window

A subcap is considered **stable** when `band_std ≤ 0.4` AND `band_trough_7d ≥ target - 1.0`.

## Root Cause Classification

Every error taxonomy key should be tagged with one of three root causes:

| Root Cause | Description | Example Taxonomy Keys |
|---|---|---|
| **Language** | The learner lacks the linguistic knowledge (vocab, grammar, phonetics) | `article_usage`, `collocation_error`, `vowel_confusion` |
| **Cognitive** | The learner has the knowledge but fails to apply it under processing load | `sentence_anatomy_fail`, `implied_meaning_fail`, `note_taking_breakdown` |
| **Strategy** | The learner applies wrong test-taking or time-management strategies | `speed_too_slow`, `distractor_trap`, `task_response_off_topic` |
