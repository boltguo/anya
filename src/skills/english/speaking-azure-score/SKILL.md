---
name: speaking-azure-score
description: "[INTERNAL] Wrapper around Azure Pronunciation Assessment — called by other speaking skills."
---

# Speaking Azure Score

Never user-facing. Documents the request/response contract for the `pron_assess` tool. Other speaking skills reference this when they need to interpret results.

## Callers

| Caller | When to call |
| ------ | ------------ |
| `speaking-shadowing` | Every repeat (first + second) |
| `speaking-repeat` | Only if pronunciation flagged weak |
| `speaking-freetalk` (scenario mode) | Only on long turns AND pronunciation flagged weak |
| `speaking-freetalk` (open mode) | Usually skipped |

## Request

```
pron_assess(
  audio_path,
  reference_text,
  locale: "en-GB" | "en-US",
  granularity: "Word" | "Phoneme"
)
```

- `granularity=Phoneme` only for `speaking-shadowing` (expensive).
- Reference = target sentence (shadowing) or transcript (others).

## Response (normalized)

```json
{
  "overall": {"accuracy":82.4,"fluency":77,"completeness":95,"prosody":71,"pronunciation":79.5},
  "words": [{"word":"opportunities","accuracy":63,"error_type":"Mispronunciation","phonemes":[...]}],
  "duration_ms": 12400
}
```

## Band mapping (pronunciation 0-100 → IELTS)

| 0-100 | Band |
| ----- | ---- |
| ≥ 90 | 8.0 |
| 80-89 | 7.0 |
| 70-79 | 6.5 |
| 60-69 | 6.0 |
| 50-59 | 5.5 |
| 40-49 | 5.0 |
| 30-39 | 4.5 |
| < 30 | 4.0 |

Use for `speaking.pronunciation_intelligibility` subcap.

## Azure error_type → taxonomy

| Azure | Taxonomy |
| ----- | -------- |
| Mispronunciation | `pronunciation_vowel` / `pronunciation_consonant` (pick by phoneme) |
| Omission | `consonant_cluster` |
| Insertion | `connected_speech_fail` |
| Low prosody | `intonation` |
| Low content-word stress | `pronunciation_stress` |

## Failure

- Network / Azure error → `{error, error_code}`. Degrade to transcript-only feedback; don't block the session.
- Audio < 3 sec → skip prosody weighting.
- Non-English detected → flag, skip scoring.

## Rules

1. **Never user-facing.** No menu entry.
2. **Single schema** — callers depend on these field names.
3. **Don't block on failure** — degrade.
4. **Phoneme granularity** only for shadowing.
