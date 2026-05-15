// commands/usage.ts — monthly API usage report

import chalk from 'chalk';
import { loadUsage } from '../lib/usage.js';

// Azure Free Tier (F0) limits
const AZURE_FREE = {
  tts_chars: 500_000,
  speech_hours: 5,     // STT + pron assessment combined
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

  console.log(chalk.bold('  🧠 LLM'));
  console.log(`     Calls:         ${chalk.white(fmtNum(usage.llm.calls))}`);
  console.log(`     Input tokens:  ${chalk.white(fmtNum(usage.llm.input_tokens))}`);
  console.log(`     Output tokens: ${chalk.white(fmtNum(usage.llm.output_tokens))}`);
  const cacheHitPct = usage.llm.input_tokens > 0
    ? Math.round((usage.llm.cached_tokens / usage.llm.input_tokens) * 100)
    : 0;
  console.log(`     Cached tokens: ${chalk.white(fmtNum(usage.llm.cached_tokens))} ${chalk.dim(`(${cacheHitPct}% hit)`)}`);

  const providers = Object.entries(usage.llm_by_provider);
  if (providers.length > 0) {
    for (const [name, stats] of providers) {
      console.log(`     ${chalk.dim(`📌 ${name}:`)} ${fmtNum(stats.calls)} calls, ${fmtNum(stats.input_tokens)}/${fmtNum(stats.output_tokens)} tok`);
    }
  }
  console.log();

  console.log(chalk.bold('  📢 TTS (Azure Speech)'));
  console.log(`     Calls:    ${chalk.white(fmtNum(usage.tts.calls))}`);
  console.log(`     Chars:    ${chalk.white(fmtNum(usage.tts.chars))} / ${fmtNum(AZURE_FREE.tts_chars)}`);
  console.log(`     Duration: ${chalk.white(fmtDuration(usage.tts.duration_sec))}`);
  console.log(`     Quota:    ${bar(usage.tts.chars, AZURE_FREE.tts_chars)}`);
  console.log();

  const speechSec = usage.pron_assess.duration_sec;
  const speechLimitSec = AZURE_FREE.speech_hours * 3600;
  console.log(chalk.bold('  🗣️  Pronunciation (Azure Speech)'));
  console.log(`     Calls:    ${chalk.white(fmtNum(usage.pron_assess.calls))}`);
  console.log(`     Duration: ${chalk.white(fmtDuration(speechSec))} / ${AZURE_FREE.speech_hours}h`);
  console.log(`     Quota:    ${bar(speechSec, speechLimitSec)}`);
  console.log();

  console.log(chalk.bold('  🎤 STT (Groq Whisper)'));
  console.log(`     Calls:    ${chalk.white(fmtNum(usage.stt.calls))}`);
  console.log(`     Duration: ${chalk.white(fmtDuration(usage.stt.duration_sec))}`);
  const day = String(new Date().getDate()).padStart(2, '0');
  const sttToday = usage.stt_daily?.[day];
  if (sttToday && sttToday.calls > 0) {
    console.log(`     Today:    ${chalk.yellow(fmtNum(sttToday.calls))} calls, ${chalk.yellow(fmtDuration(sttToday.duration_sec))}`);
  }
  console.log();

  console.log(chalk.bold('  🔍 Web Search (Tavily)'));
  console.log(`     Calls:    ${chalk.white(fmtNum(usage.web_search.calls))}`);
  console.log();

  console.log(chalk.bold('  👀 Vision (Gemini)'));
  console.log(`     Calls:    ${chalk.white(fmtNum(usage.vision.calls))}`);
  console.log();
}
