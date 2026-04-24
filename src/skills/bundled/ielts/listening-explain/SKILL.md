---
name: listening-explain
description: "Explain why listening misses happened, citing transcript lines + trap category."
---

# Listening Explain

Read-only. Takes one listening session and pinpoints every miss to a transcript line.

## When to Use

- `讲解听力 / 为什么我错 / explain listening`
- Callback `listening-explain`
- Right after `listening-exam` or any listening drill

## Workflow

1. Locate sample: `sample_id` from callback or the most recent listening sample. Pull linked errors + subcap scores. Load `analysis-weakness/assets/error-taxonomy.md`.
2. Rank by severity × frequency × teaching value. Top 2-3 issues.
3. Per issue: question + learner answer + correct answer + transcript evidence (+ timestamp) + taxonomy key + root cause + fix pattern. Optional `tts` replay of the key segment at rate −10%.
4. Pattern warning if the same key appears ≥ 2 in this session OR ≥ 4 in last 7 days.
5. One action button mapped to the top issue:

| Top issue | Callback |
| --------- | -------- |
| `number_confusion` / `spelling_error` | `listening-numberdrill` |
| `function_word_miss` | `listening-dictation` |
| `connected_speech_fail` | `listening-shadowing` |
| `paraphrase_miss` | `listening-prediction` |
| map / `distractor_trap` | `listening-mapdrill` |
| generic weak | `listening-dictation` |

Queries: `support/ielts-data-contract/references/queries.md`.

## Rules

1. **Top 2-3 only.**
2. **Cite the transcript line.**
3. **Name the taxonomy key + root cause.**
4. **TTS replay optional** — only when hearing the moment clarifies the fix.
5. **Pattern warning loud** when it applies.
6. **No MEMORY writes.**
7. **No session → route to listening-exam / listening-dictation.**
