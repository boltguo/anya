// lib/promptHash.ts — shared prompt-hash helpers for dedup + practice rows.
//
// Convention (per study.sql): `prompt_hash` = first 12 hex of sha1(normalized prompt).
// Normalization strips punctuation, lower-cases, collapses whitespace so
// "I read React docs." and "I read React docs" hash identically.

import { createHash } from 'node:crypto';

export function normalizePromptText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function computePromptHash(text: string): string {
  const normalized = normalizePromptText(text);
  return createHash('sha1').update(normalized).digest('hex').slice(0, 12);
}
