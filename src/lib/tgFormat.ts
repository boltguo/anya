/**
 * @module lib/tgFormat
 * @description Converts Markdown (LLM output) to Telegram-compatible HTML.
 *
 * Telegram HTML supports a limited subset:
 *   <b>, <i>, <u>, <s>, <code>, <pre language="...">,
 *   <a href="...">, <tg-spoiler>, <blockquote>
 *
 * This converter handles the most common Markdown patterns LLMs produce
 * and maps them to Telegram HTML. Unsupported elements are stripped or
 * rendered as plain text.
 */

/**
 * Convert LLM Markdown output to Telegram HTML.
 */
export function markdownToTelegramHtml(md: string): string {
  let html = md;

  // Escape HTML entities first (before we add our own tags)
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // ── Block elements (process line by line) ──────────────────────────────────

  // Code blocks: ```language\n...\n``` → <pre language="...">...</pre>
  html = html.replace(
    /```(\w+)?\n([\s\S]*?)```/g,
    (_match, lang, code) => {
      const langAttr = lang ? ` language="${lang}"` : '';
      return `<pre${langAttr}>${code.trimEnd()}</pre>`;
    },
  );

  // Headers: ## Title → <b>Title</b> (Telegram has no headers)
  html = html.replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>');

  // Blockquotes: > text → <blockquote>text</blockquote>
  // Handle multi-line blockquotes (consecutive > lines)
  html = html.replace(
    /(?:^&gt;\s?(.*)$\n?)+/gm,
    (match) => {
      const lines = match
        .split('\n')
        .map((l) => l.replace(/^&gt;\s?/, ''))
        .filter((l) => l !== undefined);
      return `<blockquote>${lines.join('\n')}</blockquote>`;
    },
  );

  // Horizontal rules: --- or *** → blank line
  html = html.replace(/^[-*]{3,}$/gm, '');

  // ── Inline elements ────────────────────────────────────────────────────────

  // Inline code: `code` → <code>code</code>
  // (but not inside <pre> blocks — those are already handled)
  html = html.replace(/`([^`\n]+?)`/g, '<code>$1</code>');

  // Bold + italic: ***text*** or ___text___
  html = html.replace(/\*{3}(.+?)\*{3}/g, '<b><i>$1</i></b>');

  // Bold: **text** → <b>text</b>
  html = html.replace(/\*{2}(.+?)\*{2}/g, '<b>$1</b>');

  // Italic: *text* or _text_ → <i>text</i>
  // Be careful not to match underscores in words like some_variable
  html = html.replace(/(?<!\w)\*(?!\s)(.+?)(?<!\s)\*(?!\w)/g, '<i>$1</i>');
  html = html.replace(/(?<!\w)_(?!\s)(.+?)(?<!\s)_(?!\w)/g, '<i>$1</i>');

  // Strikethrough: ~~text~~ → <s>text</s>
  html = html.replace(/~~(.+?)~~/g, '<s>$1</s>');

  // Links: [text](url) → <a href="url">text</a>
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Unordered lists: - item or * item → • item
  html = html.replace(/^[\s]*[-*]\s+/gm, '• ');

  // Ordered lists: 1. item → 1. item (keep as-is, looks fine)

  return html.trim();
}

/**
 * Try sending as HTML, fallback to plain text if parsing fails.
 *
 * This is the primary send function used by the Telegram adapter.
 */
export function prepareReply(content: string): { text: string; parseMode: 'HTML' | undefined } {
  try {
    const html = markdownToTelegramHtml(content);
    return { text: html, parseMode: 'HTML' };
  } catch {
    return { text: content, parseMode: undefined };
  }
}
