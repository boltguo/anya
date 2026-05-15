// tools/pronAssess.ts — Azure pronunciation scoring

import { readFileSync } from 'node:fs';
import { register } from './registry.js';
import { agentLogger } from '../lib/logger.js';
import { trackPronAssess } from '../lib/usage.js';
import type { ToolContext } from '../agent/types.js';

register({
  name: 'pron_assess',
  timeoutMs: 60_000,
  description: 'Assess pronunciation quality of a voice recording using Azure Speech. Returns accuracy, fluency, completeness, prosody scores and per-word breakdown. Use this when the user wants pronunciation feedback on their spoken English. The audio_path is provided in the voice message metadata.',
  parameters: {
    type: 'object',
    properties: {
      audio_path: {
        type: 'string',
        description: 'Absolute path to the voice audio file (OGG/Opus or WAV). Extract from the voice message metadata [audio_path: ...].',
      },
      reference_text: {
        type: 'string',
        description: 'Optional reference text the user was supposed to read. If provided, enables scripted mode with word-level mismatch detection. If omitted, uses unscripted (free speech) mode.',
      },
      language: {
        type: 'string',
        description: 'Language code for assessment. Default: "en-US". Other options: "en-GB", "zh-CN", etc.',
      },
    },
    required: ['audio_path'],
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<string> {
    const audioPath = String(args.audio_path || '');
    if (!audioPath) return 'Error: audio_path is required.';

    const referenceText = args.reference_text ? String(args.reference_text) : '';
    const language = String(args.language || 'en-US');

    const config = context.config;
    const speechKey = config.azure?.speech_key;
    const speechRegion = config.azure?.speech_region || 'eastasia';

    if (!speechKey) {
      return 'Error: Azure Speech key not configured. Run "anya config" to set azure.speech_key and azure.speech_region.';
    }

    agentLogger.info({ msg: 'pron_assess_start', audioPath, language, hasRef: !!referenceText });

    try {
      // Azure pron assessment scores significantly better with WAV than raw OGG/Opus.
      const isOgg = audioPath.endsWith('.ogg') || audioPath.endsWith('.oga');
      let audioBuffer: Buffer;
      let contentType: string;

      if (isOgg) {
        const { convertToWav } = await import('../lib/ffmpeg.js');
        const wavPath = convertToWav(audioPath);
        if (wavPath) {
          audioBuffer = readFileSync(wavPath);
          contentType = 'audio/wav';
          agentLogger.info({ msg: 'pron_assess_converted', from: 'ogg', to: 'wav', bytes: audioBuffer.length });
        } else {
          // Fallback: when ffmpeg is missing, send raw OGG and accept lower scoring quality.
          audioBuffer = readFileSync(audioPath);
          contentType = 'audio/ogg; codecs=opus';
          agentLogger.info({ msg: 'pron_assess_no_ffmpeg', fallback: 'ogg' });
        }
      } else {
        audioBuffer = readFileSync(audioPath);
        contentType = 'audio/wav';
      }

      const assessConfig: Record<string, unknown> = {
        GradingSystem: 'HundredMark',
        Granularity: 'Word',
        Dimension: 'Comprehensive',
        EnableMiscue: !!referenceText,
      };

      if (referenceText) {
        assessConfig.ReferenceText = referenceText;
      }

      // Azure requires the assessment config base64-encoded in a header.
      const assessHeader = Buffer.from(JSON.stringify(assessConfig)).toString('base64');

      const url = `https://${speechRegion}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${language}&format=detailed`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': speechKey,
          'Pronunciation-Assessment': assessHeader,
          'Content-Type': contentType,
          'Accept': 'application/json',
        },
        body: audioBuffer,
      });

      if (!response.ok) {
        const errText = await response.text();
        agentLogger.error({ msg: 'pron_assess_api_error', status: response.status, error: errText });
        return `Error: Azure Speech API returned ${response.status}: ${errText}`;
      }

      const result = await response.json() as any;
      agentLogger.info({ msg: 'pron_assess_done', status: result.RecognitionStatus });

      if (result.RecognitionStatus !== 'Success') {
        return `Pronunciation assessment failed: ${result.RecognitionStatus}. Make sure the audio contains clear speech.`;
      }

      const nbest = result.NBest?.[0];
      if (!nbest) {
        return 'No assessment results returned. The audio may be too short or unclear.';
      }

      // Azure REST v1 places scores directly on NBest, not under PronunciationAssessment.
      const pronAssessment = nbest.PronunciationAssessment || nbest;
      const hasScores = pronAssessment.AccuracyScore !== undefined || pronAssessment.PronScore !== undefined;
      if (!hasScores) {
        return `Pronunciation assessment data not available. Raw: ${JSON.stringify(nbest).substring(0, 500)}`;
      }

      const words = (nbest.Words || []).map((w: any) => {
        const wa = w.PronunciationAssessment || w;
        const wordResult: Record<string, unknown> = {
          word: w.Word,
          accuracy: wa.AccuracyScore,
        };
        if (wa.ErrorType && wa.ErrorType !== 'None') {
          wordResult.error = wa.ErrorType; // Mispronunciation, Omission, Insertion
        }
        return wordResult;
      });

      const audioDurationSec = (result.Duration || 0) / 10_000_000; // Azure returns 100ns ticks
      const output = {
        recognized_text: nbest.Display || nbest.Lexical,
        scores: {
          accuracy: pronAssessment.AccuracyScore,
          fluency: pronAssessment.FluencyScore,
          completeness: pronAssessment.CompletenessScore,
          prosody: pronAssessment.ProsodyScore,
          pronunciation: pronAssessment.PronScore,
        },
        words,
        reference_text: referenceText || undefined,
      };

      trackPronAssess(audioDurationSec);

      return JSON.stringify(output, null, 2);
    } catch (err) {
      const error = err as Error;
      agentLogger.error({ msg: 'pron_assess_error', error: error.message });
      return `Error: Pronunciation assessment failed: ${error.message}`;
    }
  },
});
