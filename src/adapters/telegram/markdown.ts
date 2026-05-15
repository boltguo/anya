// adapters/telegram/markdown.ts — markdown split/strip helpers

export function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^[-*]{3,}$/gm, '')
    .replace(/^\s*[-*]\s+/gm, '• ');
}

// Split before HTML conversion so each segment converts independently — avoids breaks inside <pre>/<a> tags
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
