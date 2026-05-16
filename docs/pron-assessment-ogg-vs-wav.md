# Azure Pronunciation Assessment: OGG vs WAV

Date: 2026-05-16

## Context

Telegram voice messages arrive as OGG/Opus files. The previous `pron_assess` path decoded those files to 16 kHz mono WAV with ffmpeg before sending them to Azure Pronunciation Assessment.

The conversion does not recover information lost by Opus compression. It only changes the container/encoding submitted to Azure. This test checks whether that conversion materially changes scoring for the voice samples already present in `~/.anya/data/audio/voice`.

## Method

Three local Telegram voice samples with both `.ogg` and converted `.wav` files were submitted to the same Azure endpoint:

`/speech/recognition/conversation/cognitiveservices/v1?language=en-US&format=detailed`

The same `Pronunciation-Assessment` config was used for both formats:

- `GradingSystem`: `HundredMark`
- `Granularity`: `Word`
- `Dimension`: `Comprehensive`
- `EnableMiscue`: `true`
- `ReferenceText`: the expected sentence from local logs

Content types:

- OGG: `audio/ogg; codecs=opus`
- WAV: `audio/wav`

## Results

| Sample | Reference | OGG scores | WAV scores | Delta |
| --- | --- | --- | --- | --- |
| `voice_1778851648265` | `I watch sci-fi movies on weekends.` | accuracy 90, fluency 100, completeness 100, pronunciation 94 | accuracy 90, fluency 100, completeness 100, pronunciation 94 | no overall difference |
| `voice_1778859391370` | `The movie was really funny tonight.` | accuracy 83, fluency 100, completeness 83, pronunciation 86.4 | accuracy 84, fluency 100, completeness 83, pronunciation 86.6 | WAV +1 accuracy, +0.2 pronunciation |
| `voice_1778859455833` | `The movie was really funny tonight.` | accuracy 88, fluency 99, completeness 100, pronunciation 92.6 | accuracy 88, fluency 99, completeness 100, pronunciation 92.6 | no overall difference |

Word-level scores varied slightly between formats. Example differences included one word moving by 3 points and one mispronounced word moving from 34 to 42, but these did not materially affect the overall assessment result.

## Conclusion

For these samples, raw Telegram OGG/Opus and ffmpeg-decoded WAV produced effectively identical overall pronunciation scores. The conversion step adds a local binary dependency and extra file I/O without a demonstrated scoring benefit.

The `pron_assess` tool should submit Telegram OGG/Opus directly to Azure using `audio/ogg; codecs=opus`. WAV should remain supported for callers that already provide PCM WAV input, but ffmpeg is no longer needed in the runtime path.

## Implication For Cloudflare

Removing ffmpeg makes a Worker-based pronunciation path more feasible:

- Telegram OGG can be fetched and submitted directly to Azure.
- R2 can store the original OGG without a derived WAV object.
- No ffmpeg container is required for normal pronunciation assessment.

If future data shows unstable OGG scoring on a larger sample set, WAV conversion can be reintroduced as an optional environment-specific path rather than a default dependency.
