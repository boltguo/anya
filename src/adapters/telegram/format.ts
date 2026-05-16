// adapters/telegram/format.ts — Markdown to Telegram HTML

import { marked } from 'marked';

// Smart text→HTML for Telegram. Handles ||spoiler|| shorthand and auto-detects
// Markdown so pure-HTML inputs aren't double-processed. Non-HTML parse modes pass through.
export function renderTelegramText(text: string | undefined, parseMode?: string): string {
  if (!text) return '';
  const mode = parseMode || 'HTML';
  if (mode !== 'HTML') return text;
  const withSpoilers = text.replace(/\|\|([^|]+?)\|\|/g, '<tg-spoiler>$1</tg-spoiler>');
  const looksLikeMarkdown = /(^|\n)\s{0,3}#{1,6}\s|\*\*[^*]+\*\*|(^|\n)\s*[-*]\s+|`{3}/m.test(withSpoilers);
  return looksLikeMarkdown ? markdownToTelegramHtml(withSpoilers) : withSpoilers;
}

// Telegram parse_mode=HTML accepts only this restricted tag set.
const ALLOWED_TAGS = new Set([
  'b', 'i', 'u', 's', 'code', 'pre', 'a',
  'blockquote', 'tg-spoiler', 'tg-emoji',
]);

export function markdownToTelegramHtml(md: string): string {
  let html = marked.parse(md, { gfm: true, async: false }) as string;

  // Protect <pre><code>...</code></pre> from subsequent transforms.
  const codeBlocks: string[] = [];
  html = html.replace(
    /<pre>\s*<code([^>]*)>([\s\S]*?)<\/code>\s*<\/pre>/g,
    (_match, attrs: string, body: string) => {
      codeBlocks.push(`<pre><code${attrs}>${body.replace(/\n+$/, '')}</code></pre>`);
      return `\x00CB${codeBlocks.length - 1}\x00`;
    },
  );

  html = html.replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/g, '<b>$1</b>\n');

  html = html.replace(/<strong>([\s\S]*?)<\/strong>/g, '<b>$1</b>');
  html = html.replace(/<em>([\s\S]*?)<\/em>/g, '<i>$1</i>');
  html = html.replace(/<del>([\s\S]*?)<\/del>/g, '<s>$1</s>');

  html = html.replace(/<ul>\s*([\s\S]*?)\s*<\/ul>/g, (_m, inner: string) => {
    return inner
      .replace(/<li>\s*([\s\S]*?)\s*<\/li>/g, '• $1\n')
      .replace(/\n\s*\n/g, '\n')
      .trimEnd() + '\n';
  });

  html = html.replace(/<ol>\s*([\s\S]*?)\s*<\/ol>/g, (_m, inner: string) => {
    let n = 0;
    return inner
      .replace(/<li>\s*([\s\S]*?)\s*<\/li>/g, (_, item: string) => `${++n}. ${item}\n`)
      .replace(/\n\s*\n/g, '\n')
      .trimEnd() + '\n';
  });

  // Strip inner <p> wrappers but preserve attrs (e.g. "expandable").
  html = html.replace(
    /<blockquote([^>]*)>\s*([\s\S]*?)\s*<\/blockquote>/g,
    (_m, attrs: string, inner: string) => {
      const text = inner.replace(/<p>([\s\S]*?)<\/p>/g, '$1').trim();
      return `<blockquote${attrs}>${text}</blockquote>`;
    },
  );

  html = html.replace(/<br\s*\/?>/g, '\n');
  html = html.replace(/<hr\s*\/?>/g, '\n━━━━━━\n');

  html = html.replace(/<p>([\s\S]*?)<\/p>/g, '$1\n');

  // Strip any tag not in the Telegram whitelist.
  html = html.replace(/<\/?([a-zA-Z][a-zA-Z0-9-]*)(?:\s[^>]*)?>/g, (full, tag: string) => {
    return ALLOWED_TAGS.has(tag.toLowerCase()) ? full : '';
  });

  html = html.replace(/\x00CB(\d+)\x00/g, (_m, i: string) => codeBlocks[+i]);

  html = html.replace(/\n{3,}/g, '\n\n').trim();

  return html;
}
