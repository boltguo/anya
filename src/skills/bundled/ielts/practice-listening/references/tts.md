# TTS Reference (Listening)

## Single speaker (monologue, dictation)

```
tts text="The library closes at six o'clock every day." voice="en-GB-SoniaNeural" rate="-10%"
```

## Multi-speaker dialogue (Short Clip, Lecture)

```
tts segments='[
  {"voice":"en-GB-RyanNeural","text":"Good morning. How can I help you today?"},
  {"break":"600ms"},
  {"voice":"en-US-AriaNeural","text":"Hi, I would like to register for the advanced course."},
  {"break":"500ms"},
  {"voice":"en-GB-RyanNeural","text":"Of course. Could I have your student ID, please?"}
]'
```

## Voice choices

| Voice | Accent | Use for |
|-------|--------|---------|
| `en-GB-SoniaNeural` | British female | Standard monologue |
| `en-GB-RyanNeural` | British male | Examiner, interviewer |
| `en-US-AriaNeural` | American female | Candidate, narrator |
| `en-US-GuyNeural` | American male | Second speaker |
| `en-AU-NatashaNeural` | Australian female | Band 6.5+ accent exposure |

## Rate guidelines

- Dictation (band < 5.0): `rate:"-10%"` — slower for newcomers
- Dictation (band ≥ 5.5): default rate
- Short Clip / Lecture: default rate
