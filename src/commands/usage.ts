// commands/usage.ts — monthly + today API usage report

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

// "label: <month>  (T <today>)" — month is the headline, today in dim parens.
function pair(label: string, monthly: string, today: string): string {
  return `${label.padEnd(15)} ${chalk.white(monthly)}  ${chalk.dim(`(T ${today})`)}`;
}

export function runUsage(month?: string): void {
  const usage = loadUsage(month);
  const today = usage.today;

  console.log();
  console.log(chalk.bold.cyan(`Anya Usage — ${usage.month}`));
  console.log();

  console.log(chalk.bold('  🧠 LLM (OpenAI)'));
  console.log('     ' + pair('Calls:',         fmtNum(usage.llm.calls),          fmtNum(today.llm.calls)));
  console.log('     ' + pair('Input tokens:',  fmtNum(usage.llm.input_tokens),   fmtNum(today.llm.input_tokens)));
  console.log('     ' + pair('Output tokens:', fmtNum(usage.llm.output_tokens),  fmtNum(today.llm.output_tokens)));
  console.log('     ' + pair('Cached tokens:', fmtNum(usage.llm.cached_tokens),  fmtNum(today.llm.cached_tokens)));
  console.log();

  console.log(chalk.bold('  📢 TTS (Azure Speech)'));
  console.log('     ' + pair('Calls:',    fmtNum(usage.tts.calls),                                       fmtNum(today.tts.calls)));
  console.log('     ' + pair('Chars:',    `${fmtNum(usage.tts.chars)} / ${fmtNum(AZURE_FREE.tts_chars)}`, fmtNum(today.tts.chars)));
  console.log('     ' + pair('Duration:', fmtDuration(usage.tts.duration_sec),                           fmtDuration(today.tts.duration_sec)));
  console.log(`     ${'Quota:'.padEnd(15)} ${bar(usage.tts.chars, AZURE_FREE.tts_chars)}`);
  console.log();

  const speechSec = usage.pron_assess.duration_sec;
  const speechLimitSec = AZURE_FREE.speech_hours * 3600;
  console.log(chalk.bold('  🗣️  Pronunciation (Azure Speech)'));
  console.log('     ' + pair('Calls:',    fmtNum(usage.pron_assess.calls),                       fmtNum(today.pron_assess.calls)));
  console.log('     ' + pair('Duration:', `${fmtDuration(speechSec)} / ${AZURE_FREE.speech_hours}h`, fmtDuration(today.pron_assess.duration_sec)));
  console.log(`     ${'Quota:'.padEnd(15)} ${bar(speechSec, speechLimitSec)}`);
  console.log();

  console.log(chalk.bold('  🎤 STT (Groq Whisper)'));
  console.log('     ' + pair('Calls:',    fmtNum(usage.stt.calls),             fmtNum(today.stt.calls)));
  console.log('     ' + pair('Duration:', fmtDuration(usage.stt.duration_sec), fmtDuration(today.stt.duration_sec)));
  console.log();

  console.log(chalk.bold('  🔍 Web Search (Tavily)'));
  console.log('     ' + pair('Calls:', fmtNum(usage.web_search.calls), fmtNum(today.web_search.calls)));
  console.log();

  console.log(chalk.bold('  👀 Vision (Gemini)'));
  console.log('     ' + pair('Calls:', fmtNum(usage.vision.calls), fmtNum(today.vision.calls)));
  console.log();
}
