// Shows an AI reply: paragraphs, lists, **bold**, `code` and code blocks. Built from React elements, never from raw HTML.
import { Fragment, type ReactNode } from 'react';

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    out.push(tok.startsWith('**') ? <strong key={i++}>{tok.slice(2, -2)}</strong> : <code key={i++}>{tok.slice(1, -1)}</code>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Rich({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r/g, '').split('\n');
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith('```')) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) code.push(lines[i++]);
      i++;
      blocks.push(<pre key={k++} className="rich__code">{code.join('\n')}</pre>);
    } else if (/^\s*([-*•]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]/.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*•]|\d+[.)])\s+/, ''));
      const li = items.map((t, j) => <li key={j}>{inline(t)}</li>);
      blocks.push(ordered ? <ol key={k++}>{li}</ol> : <ul key={k++}>{li}</ul>);
    } else if (/^#{1,4}\s+/.test(line)) {
      blocks.push(<p key={k++} className="rich__h">{inline(line.replace(/^#{1,4}\s+/, ''))}</p>);
      i++;
    } else if (!line.trim()) {
      i++;
    } else {
      const para: string[] = [];
      while (i < lines.length && lines[i].trim() && !/^\s*([-*•]|\d+[.)])\s+/.test(lines[i]) && !lines[i].trim().startsWith('```') && !/^#{1,4}\s+/.test(lines[i])) para.push(lines[i++]);
      blocks.push(<p key={k++}>{para.map((t, j) => <Fragment key={j}>{j > 0 && <br />}{inline(t)}</Fragment>)}</p>);
    }
  }
  return <div className="rich">{blocks}</div>;
}
