/**
 * @module adapters/telegram/markdown
 * @description Pure helpers for splitting and stripping Markdown text before
 * delivery to Telegram. These functions are stateless and side-effect free.
 */

/**
 * Strips Markdown decoration from a string while preserving the visible text.
 * Used as a plain-text fallback when Telegram rejects HTML parse_mode formatting.
 *
 * @param text - The raw Markdown text to be stripped.
 * @returns The plain-text string with Markdown syntax removed.
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')              // ## headings
    .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')    // ***bold+italic***
    .replace(/\*\*([^*]+)\*\*/g, '$1')        // **bold**
    .replace(/\*([^*]+)\*/g, '$1')            // *italic*
    .replace(/~~(.+?)~~/g, '$1')              // ~~strikethrough~~
    .replace(/`([^`]+)`/g, '$1')              // `code`
    .replace(/^[-*]{3,}$/gm, '')              // ---
    .replace(/^\s*[-*]\s+/gm, '• ');          // - list → bullet
}

/**
 * Splits source markdown into Telegram-sendable segments without breaking
 * structured blocks. It prefers paragraph boundaries (blank lines).
 * If a single paragraph is too long, it falls back to splitting by lines or hard slices.
 *
 * Splitting is performed before HTML conversion to ensure each segment converts
 * independently, avoiding breaks inside HTML tags (like `<pre>` or `<a>`) and
 * keeping fallback plain-text aligned properly.
 *
 * @param text - The full Markdown text to split.
 * @param maxLen - The maximum allowed length per segment (Telegram allows up to 4096 characters).
 * @returns An array of string segments that fit within the specified maximum length.
 */
export function splitMarkdownForTelegram(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];

  const paragraphs = text.split(/\n\n+/);
  const segments: string[] = [];
  let buf = '';

  const flush = () => {
    if (buf.length > 0) {
      segments.push(buf);
      buf = '';
    }
  };

  const appendParagraph = (para: string) => {
    const joiner = buf.length > 0 ? '\n\n' : '';
    if (buf.length + joiner.length + para.length <= maxLen) {
      buf += joiner + para;
    } else {
      flush();
      if (para.length <= maxLen) {
        buf = para;
      } else {
        // Fallback: split a long paragraph by lines.
        for (const line of para.split('\n')) {
          if (line.length <= maxLen) {
            const j = buf.length > 0 ? '\n' : '';
            if (buf.length + j.length + line.length <= maxLen) {
              buf += j + line;
            } else {
              flush();
              buf = line;
            }
          } else {
            // Hard slice fallback for extremely long continuous strings.
            flush();
            for (let i = 0; i < line.length; i += maxLen) {
              segments.push(line.substring(i, i + maxLen));
            }
          }
        }
      }
    }
  };

  for (const para of paragraphs) appendParagraph(para);
  flush();
  return segments;
}
