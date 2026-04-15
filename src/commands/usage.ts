/**
 * @module commands/usage
 * @description `anya usage` — Show monthly API usage statistics.
 *
 * Displays all metered service usage for the current month:
 * LLM tokens, TTS chars/duration, STT, pronunciation assessment,
 * Vision, and image generation.
 */

import chalk from 'chalk';
import { loadUsage } from '../lib/usage.js';

// Azure Free Tier (F0) limits
const AZURE_FREE = {
  tts_chars: 500_000,
  speech_hours: 5,     // STT + Pronunciation Assessment combined
};

function fmtNum(n: number): string {
  return n.toLocaleString();
}

function fmtDuration(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${Math.round(sec % 60)}s`;
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

function bar(used: number, total: number, width = 20): string {
  const pct = Math.min(used / total, 1);
  const filled = Math.round(pct * width);
  const empty = width - filled;
  const color = pct > 0.9 ? chalk.red : pct > 0.7 ? chalk.yellow : chalk.green;
  return color('█'.repeat(filled)) + chalk.dim('░'.repeat(empty)) + chalk.dim(` ${Math.round(pct * 100)}%`);
}

export function runUsage(month?: string): void {
  const usage = loadUsage(month);

  console.log();
  console.log(chalk.bold.cyan(`Anya Usage — ${usage.month}`));
  console.log();

  // ── LLM ──
  console.log(chalk.bold('  🧠 LLM (Gemini / OpenAI)'));
  console.log(`     Calls:         ${chalk.white(fmtNum(usage.llm.calls))}`);
  console.log(`     Input tokens:  ${chalk.white(fmtNum(usage.llm.input_tokens))}`);
  console.log(`     Output tokens: ${chalk.white(fmtNum(usage.llm.output_tokens))}`);
  if (usage.llm.cached_tokens > 0) {
    console.log(`     Cached tokens: ${chalk.white(fmtNum(usage.llm.cached_tokens))}`);
  }
  console.log();

  // ── TTS (Azure) ──
  console.log(chalk.bold('  📢 TTS (Azure Speech)'));
  console.log(`     Calls:    ${chalk.white(fmtNum(usage.tts.calls))}`);
  console.log(`     Chars:    ${chalk.white(fmtNum(usage.tts.chars))} / ${fmtNum(AZURE_FREE.tts_chars)}`);
  console.log(`     Duration: ${chalk.white(fmtDuration(usage.tts.duration_sec))}`);
  console.log(`     Quota:    ${bar(usage.tts.chars, AZURE_FREE.tts_chars)}`);
  console.log();

  // ── Pronunciation Assessment (Azure, 5h free tier) ──
  const speechSec = usage.pron_assess.duration_sec;
  const speechLimitSec = AZURE_FREE.speech_hours * 3600;
  console.log(chalk.bold('  🗣️  Pronunciation (Azure Speech)'));
  console.log(`     Calls:    ${chalk.white(fmtNum(usage.pron_assess.calls))}`);
  console.log(`     Duration: ${chalk.white(fmtDuration(speechSec))} / ${AZURE_FREE.speech_hours}h`);
  console.log(`     Quota:    ${bar(speechSec, speechLimitSec)}`);
  console.log();

  // ── STT (Groq) ──
  console.log(chalk.bold('  🎤 STT (Groq Whisper)'));
  console.log(`     Calls:    ${chalk.white(fmtNum(usage.stt.calls))}`);
  console.log(`     Duration: ${chalk.white(fmtDuration(usage.stt.duration_sec))}`);
  console.log();

  // ── Vision (Gemini) ──
  console.log(chalk.bold('  👁️  Vision (Gemini)'));
  console.log(`     Calls:    ${chalk.white(fmtNum(usage.vision.calls))}`);
  console.log();

  // ── Image Gen (Vertex) ──
  console.log(chalk.bold('  🖼️  Image Gen (Vertex AI)'));
  console.log(`     Calls:    ${chalk.white(fmtNum(usage.image_gen.calls))}`);
  console.log();

  // ── Web Search (Tavily) ──
  console.log(chalk.bold('  🔍 Web Search (Tavily)'));
  console.log(`     Calls:    ${chalk.white(fmtNum(usage.web_search.calls))}`);
  console.log();
}
