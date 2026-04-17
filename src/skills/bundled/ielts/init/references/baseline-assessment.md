# Starting Calibration Template

Run immediately after `USER.md` is written.

Goal: create a usable starting score range without making the learner feel tested.

## Core Principle

Do **not** run a mini-exam here unless the learner explicitly asks for one.

Prefer these evidence sources, in order:

1. A known recent IELTS score or equivalent official score
2. The learner's self-reported current level
3. Daily English exposure + stated strengths / weaknesses
4. The learner's first spontaneous English message if one already exists
5. If evidence is thin, start with a conservative middle estimate and recalibrate after real practice

## Mapping Rule

Use broad ranges, not fake precision.

### Self-report → starting overall band

| Self-report / signal | Suggested starting band |
| --- | --- |
| 基础比较弱 / almost no daily English | `4.0-4.5` |
| 能简单交流 | `4.5-5.0` |
| 能表达观点但不稳定 | `5.0-5.5` |
| 比较流利但有明显漏洞 | `5.5-6.0` |
| 表达较自然、错误可控 | `6.0-6.5` |
| 明显灵活准确 | `7.0+` |

### Known score rule

If the learner gives a recent real IELTS score:

- use it as the starting `Overall`
- split the four skills from that score unless the learner reports a clear strong/weak skill
- if they explicitly say one skill is much weaker/stronger, adjust that skill by `±0.5`

### Strength / weakness adjustment

Use stated strengths and weaknesses to split skill bands:

- says reading is strongest → `Reading +0.5`
- says speaking is weakest → `Speaking -0.5`
- says listening is difficult → `Listening -0.5`
- says writing is hard to organize → `Writing -0.5`

Keep the spread modest. The goal is usable calibration, not precision.

## Adaptive Control Rule

After setting the bands, derive training support from the `Overall` band:

| Overall | Support level | Difficulty style |
| --- | --- | --- |
| `< 4.5` | high | short prompts, clear frames, more examples |
| `4.5-5.5` | medium-high | scaffolded practice, one task at a time |
| `5.5-6.5` | medium | less hand-holding, more open response |
| `6.5+` | low | natural prompts, abstract topics, fewer hints |

Fill:

- `Adaptive Training Controls.recommended_difficulty`
- `Adaptive Training Controls.recommended_support_level`
- `Adaptive Training Controls.speaking_complexity`
- `Adaptive Training Controls.listening_sentence_length`
- `Adaptive Training Controls.reading_text_length`
- `Adaptive Training Controls.writing_prompt_scope`

## MEMORY Write Rule

Write MEMORY via the `memory` tool:

- `Status.initialized: true`
- `Status.last_active`: today
- `Status.total_sessions: 0`
- `Calibration.profile_confidence`: `low` or `medium`
- `Calibration.based_on`: `init lightweight calibration`
- `Calibration.score_source`: `known score` / `self report` / `self report + profile`
- `Calibration.latest_score_update`: today
- `IELTS Bands.Speaking`
- `IELTS Bands.Listening`
- `IELTS Bands.Reading`
- `IELTS Bands.Writing`
- `IELTS Bands.Overall`
- `IELTS Bands.updated`: today
- `Vocabulary Profile.cefr` if inferable
- `Vocabulary Profile.receptive_level` if inferable
- `Vocabulary Profile.productive_level` if inferable
- `Vocabulary Profile.known_domains` if inferable
- `Vocabulary Profile.weak_domains` if inferable
- `Vocabulary Profile.missing_functions` if inferable
- `Weak Dimensions.*`: fill only if the learner clearly reported them
- `Grammar Profile.weak`: fill only if the learner clearly reported it
- `Speaking Profile.pronunciation_weak`: only if the learner explicitly mentioned it or sent voice evidence

Leave unsupported fields as `(not set)`.

## Result Message Template

Keep the result short and low-pressure:

```text
设置完成 ✅

我先按一个大致起点来陪你练，后面会边练边校准：

- 🗣️ 口语：{{speaking_band}}
- 🎧 听力：{{listening_band}}
- 📖 阅读：{{reading_band}}
- ✍️ 写作：{{writing_band}}

你不用把它当成考试分数，我只是拿它来控制题目的难度和支持力度。
```

Do not over-explain the calculation.
