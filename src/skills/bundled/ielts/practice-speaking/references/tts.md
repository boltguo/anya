# TTS Reference (Speaking)

## Simple mode (corrections, target sentences)

```
tts text="While it is true that technology has benefits, we cannot overlook the drawbacks." voice="en-GB-SoniaNeural"
```

## Dialogue mode (role-play, examiner sim)

```
tts segments='[
  {"voice":"en-GB-RyanNeural","text":"Can you tell me about your hometown?"},
  {"break":"800ms"},
  {"voice":"en-US-AriaNeural","text":"Sure. I come from a small city in the south of China."}
]'
```

## Voice choices

| Voice | Accent | Use for |
|-------|--------|---------|
| `en-GB-RyanNeural` | British male | Examiner |
| `en-GB-SoniaNeural` | British female | Model answers |
| `en-US-AriaNeural` | American female | Candidate demos |
| `en-US-GuyNeural` | American male | Second speaker |

## Rate guidelines

- Shadowing target sentence: `rate:"-15%"` (slow, learnable pace)
- Correction demo: default rate
- Dialogue: default rate
