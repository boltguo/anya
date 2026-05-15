// adapters/telegram/skillMenu.ts — data-driven inline menu pages

import { InlineKeyboard } from 'grammy';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SKILLS_DIR } from '../../lib/paths.js';

interface MenuPage {
  text: string;
  buttons: string[][];
}

interface MenuDef {
  [page: string]: MenuPage;
}

let pageIndex: Map<string, MenuPage> | null = null;
let cacheTime = 0;
const CACHE_TTL_MS = 60_000;

function ensureLoaded(): void {
  const now = Date.now();
  if (pageIndex && now - cacheTime < CACHE_TTL_MS) return;

  pageIndex = new Map();
  scanDir(SKILLS_DIR);
  cacheTime = now;
}

function scanDir(dir: string): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const name of entries) {
    if (name.startsWith('.')) continue;

    const fullPath = join(dir, name);
    let isDir = false;
    try {
      isDir = statSync(fullPath).isDirectory();
    } catch {
      continue;
    }

    if (!isDir) continue;

    const menuPath = join(fullPath, 'templates', 'menu.json');
    if (existsSync(menuPath)) {
      try {
        const raw = readFileSync(menuPath, 'utf-8');
        const menu: MenuDef = JSON.parse(raw);
        for (const [pageName, page] of Object.entries(menu)) {
          pageIndex!.set(pageName, page);
        }
      } catch {
        // skip malformed JSON
      }
    }

    scanDir(fullPath);
  }
}

function buildKeyboard(buttons: string[][]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const row of buttons) {
    for (const item of row) {
      const pipeIdx = item.lastIndexOf('|');
      if (pipeIdx === -1) {
        const v = item.trim();
        kb.text(v, v);
      } else {
        kb.text(item.substring(0, pipeIdx).trim(), item.substring(pipeIdx + 1).trim());
      }
    }
    kb.row();
  }
  return kb;
}

export function isNavCallback(data: string): boolean {
  return data.startsWith('nav:');
}

export function getMenuPage(pageName: string): { text: string; keyboard: InlineKeyboard } | null {
  ensureLoaded();
  const page = pageIndex!.get(pageName);
  if (!page) return null;
  return { text: page.text, keyboard: buildKeyboard(page.buttons) };
}

export function getMainMenu(): { text: string; keyboard: InlineKeyboard } | null {
  return getMenuPage('main');
}

export function getNavPage(data: string): { text: string; keyboard: InlineKeyboard } | null {
  return getMenuPage(data.replace('nav:', ''));
}
