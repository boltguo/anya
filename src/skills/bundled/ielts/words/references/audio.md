# Audio Contract (Words)

## Learning Audio

When generating audio for a word card, use segmented `tts` so the word is spoken 3 times, then the example sentence:

```json
[
  {"voice":"en-GB-SoniaNeural","text":"<word>"},
  {"break":"600ms"},
  {"voice":"en-GB-SoniaNeural","text":"<word>"},
  {"break":"600ms"},
  {"voice":"en-GB-SoniaNeural","text":"<word>"},
  {"break":"1200ms"},
  {"voice":"en-GB-SoniaNeural","text":"<example sentence>","rate":"-5%"}
]
```

## Rules

1. **Lookup / learn / review all send audio first when available.**
2. If `audio_path` exists, reuse it with `tg(type:"voice", url:"<audio_path>")`.
3. If `audio_path` is empty, call `tts`, capture returned `filePath`, and persist it.
4. Use simple `tts(text:"<word>")` only for fallback. Default is segmented audio.
