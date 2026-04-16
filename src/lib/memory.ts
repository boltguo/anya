/**
 * @module lib/memory
 * @description Structured memory storage layer.
 *
 * Stores memories as typed JSON entries in ~/.anya/memory.json.
 * Each entry has a type, content, and timestamps.
 *
 * Types:
 * - user: Facts about the user (name, preferences, habits)
 * - learned: Things the agent learned (corrections, clarifications)
 * - context: Ongoing context (current projects, goals, schedules)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { join } from 'node:path';
import { ANYA_HOME } from './paths.js';

const MEMORY_PATH = join(ANYA_HOME, 'memory.json');

export type MemoryType = 'user' | 'learned' | 'context';

export interface MemoryEntry {
  id: string;
  type: MemoryType;
  content: string;
  created: string;
  updated: string;
}

/** Load all memories from disk. */
export function loadMemories(): MemoryEntry[] {
  if (!existsSync(MEMORY_PATH)) return [];
  try {
    return JSON.parse(readFileSync(MEMORY_PATH, 'utf-8'));
  } catch {
    return [];
  }
}

/** Save all memories to disk. */
function saveMemories(entries: MemoryEntry[]): void {
  const dir = dirname(MEMORY_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(MEMORY_PATH, JSON.stringify(entries, null, 2) + '\n', 'utf-8');
}

/** Generate a short ID. */
function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** Save a new memory or update existing one with matching content. */
export function memorySave(type: MemoryType, content: string): MemoryEntry {
  const entries = loadMemories();
  const now = new Date().toISOString();

  // Check for duplicate/similar content — update if exists
  const existing = entries.find(e =>
    e.type === type && e.content.toLowerCase().includes(content.toLowerCase().slice(0, 30))
  );

  if (existing) {
    existing.content = content;
    existing.updated = now;
    saveMemories(entries);
    return existing;
  }

  const entry: MemoryEntry = {
    id: genId(),
    type,
    content,
    created: now,
    updated: now,
  };

  entries.push(entry);
  saveMemories(entries);
  return entry;
}

/** Search memories by keyword. */
export function memorySearch(query: string, type?: MemoryType): MemoryEntry[] {
  const entries = loadMemories();
  const q = query.toLowerCase();
  return entries.filter(e => {
    if (type && e.type !== type) return false;
    return e.content.toLowerCase().includes(q);
  });
}

/** Delete a memory by ID. */
export function memoryDelete(id: string): boolean {
  const entries = loadMemories();
  const idx = entries.findIndex(e => e.id === id);
  if (idx === -1) return false;
  entries.splice(idx, 1);
  saveMemories(entries);
  return true;
}

/** List memories by type. */
export function memoryList(type?: MemoryType): MemoryEntry[] {
  const entries = loadMemories();
  if (!type) return entries;
  return entries.filter(e => e.type === type);
}

/**
 * Build a concise memory summary for injection into the system prompt.
 * Groups by type, shows most recent entries first.
 */
export function buildMemorySummary(): string {
  const entries = loadMemories();
  if (entries.length === 0) return '';

  const sections: string[] = ['## Memory\n'];

  const byType: Record<MemoryType, MemoryEntry[]> = { user: [], learned: [], context: [] };
  for (const e of entries) {
    byType[e.type]?.push(e);
  }

  if (byType.user.length > 0) {
    sections.push('### About the User');
    for (const e of byType.user) sections.push(`- ${e.content}`);
  }

  if (byType.context.length > 0) {
    sections.push('\n### Current Context');
    for (const e of byType.context) sections.push(`- ${e.content}`);
  }

  if (byType.learned.length > 0) {
    sections.push('\n### Learned');
    for (const e of byType.learned.slice(-10)) sections.push(`- ${e.content}`);
  }

  return sections.join('\n');
}
