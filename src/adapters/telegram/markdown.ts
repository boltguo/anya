/**
 * @module adapters/telegram/markdown
 * @description Pure helpers for splitting and stripping Markdown text before
 * delivery to Telegram. Stateless and side-effect free.
 */

/**
 * Strip Markdown decoration while preserving visible text. Used as a plain-text
 * fallback when Telegram rejects HTML parse_mode.
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
 * Split source markdown into Telegram-sendable segments without breaking
 * structured blocks. Prefers paragraph (blank-line) boundaries; for a single
 * oversized paragraph, falls back to line / hard-slice splits.
 *
 * We split the markdown *before* HTML conversion so each segment converts
 * independently — this avoids cutting inside `<pre>` / `<a>` tags and keeps
 * fallback plain-text aligned with its chunk.
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
        // Paragraph itself too long — split by lines, then by hard slice.
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
