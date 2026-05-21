// lib/pronAssessNormalize.ts — canonicalize Azure pron_assess responses.
//
// Multiple compound tools (assess_listening_fluency, assess_speaking_phoneme_accuracy,
// optionally speaking-repeat) all need the same mapping from Azure's 0-100
// scores to DB-friendly 0-1 accuracy + a weak-words breakdown. Single helper
// keeps the mapping consistent across skills.

export interface AzurePronScores {
  accuracy: number;       // word-level phoneme accuracy 0-100
  fluency: number;        // 0-100, drives rhythm/credit gating for listening-shadowing
  completeness: number;   // 0-100
  prosody: number;        // 0-100
  pronunciation: number;  // overall 0-100
}

export interface AzureWordResult {
  word: string;
  accuracy: number;       // 0-100
  error?: string;         // Mispronunciation | Omission | Insertion (when set)
}

export interface AzurePronAssessOutput {
  recognized_text: string;
  scores: AzurePronScores;
  words: AzureWordResult[];
  reference_text?: string;
}

export interface NormalizedFluencyResult {
  // 0-1 ratio for the DB `accuracy` column. Drives credit gating per skill spec
  // (listening-shadowing uses fluency/100; speaking-shadowing uses accuracy/100).
  accuracy: number;
  // 0-100 separate pronunciation accuracy. Kept for transparency / band_overall.
  band_pronunciation: number;
  // Raw scores for evidence + downstream subcap computation.
  scores: AzurePronScores;
  // Per-word breakdown (untouched, for LLM feedback writing).
  words: AzureWordResult[];
  // Words that scored below threshold OR returned Mispronunciation. Candidates
  // for the coaching audio scaffold.
  weak_words: string[];
  // Recognized text from Azure (whisper-like transcript).
  recognized_text: string;
}

const WEAK_WORD_ACCURACY_THRESHOLD = 60;

export function normalizeFluencyResult(azure: AzurePronAssessOutput): NormalizedFluencyResult {
  const fluency = clamp01x100(azure.scores?.fluency ?? 0);
  const accuracy0to1 = fluency / 100;

  const weak_words = (azure.words || [])
    .filter(w => (w.accuracy ?? 100) < WEAK_WORD_ACCURACY_THRESHOLD || w.error === 'Mispronunciation')
    .map(w => w.word);

  return {
    accuracy: accuracy0to1,
    band_pronunciation: clamp01x100(azure.scores?.accuracy ?? azure.scores?.pronunciation ?? 0),
    scores: azure.scores,
    words: azure.words || [],
    weak_words,
    recognized_text: azure.recognized_text,
  };
}

// Skill-specific: speaking-shadowing scores phoneme accuracy as the primary
// signal (not fluency). Keep separate so callers are explicit about which
// signal drives credit.
export function normalizePhonemeAccuracyResult(azure: AzurePronAssessOutput): NormalizedFluencyResult {
  const accuracy = clamp01x100(azure.scores?.accuracy ?? 0);
  const accuracy0to1 = accuracy / 100;
  const weak_words = (azure.words || [])
    .filter(w => (w.accuracy ?? 100) < WEAK_WORD_ACCURACY_THRESHOLD || w.error === 'Mispronunciation')
    .map(w => w.word);

  return {
    accuracy: accuracy0to1,
    band_pronunciation: accuracy,
    scores: azure.scores,
    words: azure.words || [],
    weak_words,
    recognized_text: azure.recognized_text,
  };
}

function clamp01x100(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}
