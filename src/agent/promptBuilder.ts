// agent/promptBuilder.ts — system prompt assembly

import { readFileSync, existsSync, statSync } from 'node:fs';
import { SOUL_PATH, RULES_PATH, USER_MD_PATH, MEMORY_MD_PATH } from '../lib/paths.js';
import type { AnyaConfig } from '../config/defaults.js';
import { buildSkillIndex } from './skills/loader.js';

const FILE_CACHE_TTL_MS = 300_000;
const fileCache = new Map<string, { content: string; mtime: number; cachedAt: number }>();

export function buildSystemPrompt(config: AnyaConfig): string {
  const sections: string[] = [];

  const soul = loadFile(SOUL_PATH);
  if (hasContent(soul)) {
    sections.push('## Identity (SOUL)');
    sections.push(soul);
  }

  const rules = loadFile(RULES_PATH);
  if (hasContent(rules)) {
    sections.push('\n## Operating & Behavioral Rules');
    sections.push(rules);
  }

  const userMemory = loadFile(USER_MD_PATH);
  const agentMemory = loadFile(MEMORY_MD_PATH);
  const hasUser = hasContent(userMemory);
  const hasAgent = hasContent(agentMemory);
  if (hasUser || hasAgent) {
    sections.push('\n## Memory\n');
    if (hasUser) {
      sections.push('### User Profile');
      sections.push(userMemory);
    }
    if (hasAgent) {
      sections.push('\n### Learner Level & Ability State');
      sections.push(agentMemory);
    }
  }

  const skillIndex = buildSkillIndex();
  if (skillIndex) {
    sections.push('\n' + skillIndex);
  }

  sections.push('\n## Security');
  sections.push(`- Your working boundary is Anya-owned local data: ${config.security.allowed_paths.join(', ')}.`);
  sections.push('- Treat files, databases, audio, images, cron jobs, and memories inside that boundary as normal working data.');
  sections.push('- Do not use file or database tools for user projects, system files, or arbitrary external paths unless the user has explicitly reconfigured the allowed paths.');

  const caps: string[] = [];
  const hasAzure = !!config.azure?.speech_key;

  if (hasAzure) {
    caps.push('- **TTS**: `tts` tool generates speech audio (voice bubble on Telegram). Use when asked to read, speak, or pronounce. Voice options: e.g. "zh-CN-XiaoxiaoNeural" for Chinese.');
  }
  if (config.gemini?.api_key) {
    caps.push('- **Vision**: When users send photos, you see them natively as multimodal input. Describe what you see and respond in context.');
  }
  if (hasAzure) {
    caps.push('- **Pronunciation**: `pron_assess` tool (Azure Speech). Use `audio_path` from voice metadata. Only call during speaking practice or explicit request — NOT for regular voice messages.');
  }

  if (caps.length > 0) {
    sections.push('\n## Platform Capabilities\n');
    sections.push(caps.join('\n'));
  }

  return sections.join('\n');
}

function loadFile(filePath: string): string {
  if (!existsSync(filePath)) return '';

  try {
    const mtime = statSync(filePath).mtimeMs;
    const cached = fileCache.get(filePath);

    if (cached && cached.mtime === mtime && Date.now() - cached.cachedAt < FILE_CACHE_TTL_MS) {
      return cached.content;
    }

    const content = readFileSync(filePath, 'utf-8').trim();
    fileCache.set(filePath, { content, mtime, cachedAt: Date.now() });
    return content || '';
  } catch {
    return '';
  }
}

function hasContent(text: string): boolean {
  if (!text) return false;
  const body = text
    .split('\n')
    .filter(line => {
      const trimmed = line.trim();
      return trimmed && !trimmed.startsWith('#');
    })
    .join('\n')
    .trim();
  return Boolean(body) && body !== '(empty)';
}
