---
name: speaking-explain
description: "Explain why a past speaking session lost marks, citing the exact phrases."
---

# Speaking Explain

Read-only. Reads one speaking session + linked errors + subcap scores, walks through the Top 2 fix points.

## When to Use

- `讲解上次 / 帮我看看那次 / 我为什么扣分 / explain speaking`
- Callback `speaking-explain`
- Coach `error_cluster` in speaking category

## Workflow

1. Locate target sample: `sample_id` from callback if given; else most recent speaking sample. Pull linked errors + subcap scores. Load `analysis-weakness/assets/error-taxonomy.md`.
2. Rank problems (severity × frequency × band_impact). Keep top 2.
3. Per issue: cite exact phrase → taxonomy key → root cause → fix pattern → corrected phrase. `tts` demo for pronunciation fixes.
4. Add structure note if Part 2 (5 elements) or Part 3 (OEE).
5. One action button mapped to the top issue:

| Top issue | Callback |
| --------- | -------- |
| pronunciation | `speaking-shadowing` |
| Part 2 structure | `speaking-repeat` |
| Part 3 abstraction | `speaking-exam` |
| fluency / pauses | `speaking-freetalk` |
| register / interaction | `speaking-roleplay` |

Queries: `support/ielts-data-contract/references/queries.md`.

## Rules

1. **Top 2 only.**
2. **Cite the actual phrase.**
3. **Name the taxonomy key + root cause.**
4. **TTS demo for pronunciation.**
5. **No new drills here, no MEMORY writes.**
6. **If no session**, route to `speaking-exam` / `speaking-freetalk`.
