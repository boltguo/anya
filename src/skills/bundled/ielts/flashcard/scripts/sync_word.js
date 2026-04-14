#!/usr/bin/env node
/**
 * sync_word.js — Sync a single word JSON file to vocab.db
 * 
 * Replaces sync_word.py
 * Reads a word JSON file, adds the word to vocab.db (or updates it),
 * and records the initial quiz result based on the user's response.
 */

import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VOCAB_DB_SCRIPT = path.join(__dirname, '..', '..', 'anya-data', 'scripts', 'vocab_db.js');

function runVocabDb(argsArray) {
  try {
    const result = spawnSync('node', [VOCAB_DB_SCRIPT, ...argsArray], { encoding: 'utf-8', timeout: 30000 });
    if (result.stdout && result.stdout.trim()) {
      try {
        return JSON.parse(result.stdout);
      } catch {
        return { ok: false, error: 'Failed to parse JSON: ' + result.stdout };
      }
    }
    return { ok: false, error: (result.stderr || '').trim() || 'No output' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function syncWord(wordPath, responseOverride = '') {
  if (!fs.existsSync(wordPath)) {
    return { ok: false, error: \`File not found: \${wordPath}\` };
  }

  let data;
  try {
    const fileContent = fs.readFileSync(wordPath, 'utf-8');
    data = JSON.parse(fileContent);
  } catch (e) {
    return { ok: false, error: \`Failed to read/parse JSON: \${e.message}\` };
  }

  const word = data.word || '';
  if (!word) {
    return { ok: false, error: 'No word field in JSON' };
  }

  const response = responseOverride || data.response || '';

  // Step 1: Check if word exists
  const lookup = runVocabDb(['lookup', word]);
  const exists = lookup.word ? true : false;

  // Step 2: Add word if not exists
  if (!exists) {
    const addArgs = ['add', '--word', word, '--source', data.source || 'flashcard'];
    const fields = [
      ['definition', '--definition'],
      ['chinese', '--chinese'],
      ['ipa', '--ipa'],
      ['pos', '--pos'],
      ['collocations', '--collocations'],
      ['topics', '--topics'],
      ['example_en', '--example'],
    ];

    for (const [field, flag] of fields) {
      if (data[field]) {
        addArgs.push(flag, String(data[field]));
      }
    }

    const addResult = runVocabDb(addArgs);
    if (!addResult.ok) {
      return { ok: false, error: \`Failed to add: \${JSON.stringify(addResult)}\`, word };
    }
  }

  // Step 3: Record quiz result if response provided
  let quizResult = null;
  if (response) {
    if (response === 'known') quizResult = 'correct';
    else if (response === 'vague') quizResult = 'partial';
    else quizResult = 'wrong';

    runVocabDb(['quiz', word, '--type', 'recognition', '--result', quizResult]);
  }

  // Step 4: Mark as synced
  data.synced = true;
  if (responseOverride) {
    data.response = responseOverride;
  }
  fs.writeFileSync(wordPath, JSON.stringify(data, null, 2), 'utf-8');

  return { ok: true, word, existed: exists, response, quiz_result: quizResult };
}

function main() {
  const options = {
    response: { type: 'string' }
  };

  const args = parseArgs({ args: process.argv.slice(2), options, allowPositionals: true, strict: false });
  const wordFile = args.positionals[0];

  if (!wordFile) {
    console.error(JSON.stringify({ error: "Missing word_file argument" }));
    process.exit(1);
  }

  const result = syncWord(wordFile, args.values.response || '');
  console.log(JSON.stringify(result, null, 2));
}

main();
