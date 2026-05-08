/**
 * @module adapters/telegram/skillMenu
 * @description Generic data-driven multi-page inline keyboard system for Telegram.
 *
 * Provides a dynamic inline keyboard interface defined by `templates/menu.json`
 * files inside skill directories. The adapter processes these JSON files directly
 * to manage pagination without requiring an LLM round-trip.
 *
 * **menu.json Format:**
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
 * **Button Action Mapping ("Label|data"):**
 *   - `nav:xxx` → Client-side page transition (handled internally by the bot).
 *   - Anything else → Forwarded to the Agent as a `[callback]` input.
 */

import { InlineKeyboard } from 'grammy';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SKILLS_DIR } from '../../lib/paths.js';

/**
 * Represents a single page within a skill menu.
 */
interface MenuPage {
  /** The text displayed alongside the keyboard for this menu page. */
  text: string;
  /** A 2D array of button labels and action data. */
  buttons: string[][];
}

/**
 * A dictionary of menu pages defined in a single JSON template.
 */
interface MenuDef {
  [page: string]: MenuPage;
}

/** Flat lookup cache: maps a page name to its page definition. */
let pageIndex: Map<string, MenuPage> | null = null;
let cacheTime = 0;
const CACHE_TTL_MS = 60_000;

/**
 * Ensures the menu pages are loaded into memory. Refreshes the cache if it
 * has exceeded its time-to-live (TTL).
 */
function ensureLoaded(): void {
  const now = Date.now();
  if (pageIndex && now - cacheTime < CACHE_TTL_MS) return;

  pageIndex = new Map();
  scanDir(SKILLS_DIR);
  cacheTime = now;
}

/**
 * Recursively scans directories to locate and load `templates/menu.json` files.
 *
 * @param dir - The directory path to scan.
 */
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
        // Skip malformed JSON files gracefully
      }
    }

    scanDir(fullPath);
  }
}

/**
 * Constructs an InlineKeyboard object from a raw buttons array.
 *
 * @param buttons - A 2D array of strings formatted as "Label|callback_data".
 * @returns A Grammy InlineKeyboard instance.
 */
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

/**
 * Checks if a provided callback data string is an internal navigation action.
 *
 * @param data - The callback data payload.
 * @returns True if the callback is for internal navigation, otherwise false.
 */
export function isNavCallback(data: string): boolean {
  return data.startsWith('nav:');
}

/**
 * Retrieves a specific menu page by its name and builds its keyboard.
 *
 * @param pageName - The identifier name of the page to load.
 * @returns An object containing the menu text and the assembled InlineKeyboard, or null if not found.
 */
export function getMenuPage(pageName: string): { text: string; keyboard: InlineKeyboard } | null {
  ensureLoaded();
  const page = pageIndex!.get(pageName);
  if (!page) return null;
  return { text: page.text, keyboard: buildKeyboard(page.buttons) };
}

/**
 * Retrieves the root "main" menu page.
 *
 * @returns An object containing the main menu text and keyboard, or null if not defined.
 */
export function getMainMenu(): { text: string; keyboard: InlineKeyboard } | null {
  return getMenuPage('main');
}

/**
 * Resolves a navigation callback string (e.g., `nav:sub_menu`) to its target page.
 *
 * @param data - The raw navigation callback data string.
 * @returns An object containing the target page text and keyboard, or null if not found.
 */
export function getNavPage(data: string): { text: string; keyboard: InlineKeyboard } | null {
  return getMenuPage(data.replace('nav:', ''));
}
