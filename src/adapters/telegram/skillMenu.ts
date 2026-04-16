/**
 * @module adapters/telegram/skillMenu
 * @description Generic data-driven multi-page inline keyboard system.
 *
 * Any skill can define a `templates/menu.json` to get a paging inline keyboard.
 * The adapter reads JSON directly — no LLM round-trip, no YAML parsing.
 *
 * menu.json format:
 * ```json
 * {
 *   "main": {
 *     "text": "🎯 Pick one",
 *     "buttons": [
 *       ["Option A|nav:sub_a", "Option B|callback_b"],
 *       ["← Back|nav:main"]
 *     ]
 *   }
 * }
 * ```
 *
 * Button format: "Label|callback_data"
 *   - nav:xxx  → client-side page switch (no agent)
 *   - anything → forwarded to agent as [callback]
 */

import { InlineKeyboard } from 'grammy';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SKILLS_DIR } from '../../lib/paths.js';

// ── Types ───────────────────────────────────────────────────────────────────

interface MenuPage {
  text: string;
  buttons: string[][];
}

interface MenuDef {
  [page: string]: MenuPage;
}

// ── Cache ───────────────────────────────────────────────────────────────────

/** Flat lookup: page name → page definition. */
let pageIndex: Map<string, MenuPage> | null = null;
let cacheTime = 0;
const CACHE_TTL_MS = 60_000;

// ── Loading ─────────────────────────────────────────────────────────────────

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
    if (name.startsWith('.') && name !== '.bundled') continue;

    const fullPath = join(dir, name);
    let isDir = false;
    try {
      isDir = statSync(fullPath).isDirectory();
    } catch { continue; }

    if (!isDir) continue;

    // Check for templates/menu.json
    const menuPath = join(fullPath, 'templates', 'menu.json');
    if (existsSync(menuPath)) {
      try {
        const raw = readFileSync(menuPath, 'utf-8');
        const menu: MenuDef = JSON.parse(raw);
        for (const [pageName, page] of Object.entries(menu)) {
          pageIndex!.set(pageName, page);
        }
      } catch { /* skip malformed */ }
    }

    // Recurse
    scanDir(fullPath);
  }
}

// ── Keyboard builder ────────────────────────────────────────────────────────

function buildKeyboard(buttons: string[][]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const row of buttons) {
    for (const item of row) {
      const pipeIdx = item.lastIndexOf('|');
      if (pipeIdx === -1) {
        kb.text(item, item);
      } else {
        kb.text(item.substring(0, pipeIdx), item.substring(pipeIdx + 1));
      }
    }
    kb.row();
  }
  return kb;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Check if a callback_data is a navigation-only action.
 */
export function isNavCallback(data: string): boolean {
  return data.startsWith('nav:');
}

/**
 * Get a menu page by name.
 */
export function getMenuPage(pageName: string): { text: string; keyboard: InlineKeyboard } | null {
  ensureLoaded();
  const page = pageIndex!.get(pageName);
  if (!page) return null;
  return { text: page.text, keyboard: buildKeyboard(page.buttons) };
}

/**
 * Get the main menu (shortcut for getMenuPage('main')).
 */
export function getMainMenu(): { text: string; keyboard: InlineKeyboard } | null {
  return getMenuPage('main');
}

/**
 * Resolve a nav: callback to its target page.
 */
export function getNavPage(data: string): { text: string; keyboard: InlineKeyboard } | null {
  return getMenuPage(data.replace('nav:', ''));
}
