// Reads the text of a PDF in the browser so the AI tutor can see the notes you have open. Nothing leaves your
// computer until you press send in the AI panel. pdf.js is loaded only when it is first needed.
import type { PDFDocumentProxy } from 'pdfjs-dist';

let loader: Promise<typeof import('pdfjs-dist')> | null = null;
function pdfjs() {
  if (!loader) {
    loader = (async () => {
      const lib = await import('pdfjs-dist');
      const worker = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
      lib.GlobalWorkerOptions.workerSrc = worker;
      return lib;
    })();
  }
  return loader;
}

const docs = new Map<string, Promise<PDFDocumentProxy>>();
const stamp = (f: File) => `${f.name}:${f.size}:${f.lastModified}`;

export function openPdf(file: File): Promise<PDFDocumentProxy> {
  const k = stamp(file);
  let p = docs.get(k);
  if (!p) {
    p = (async () => {
      const lib = await pdfjs();
      return lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    })();
    docs.set(k, p);
    if (docs.size > 3) docs.delete(docs.keys().next().value as string);
    p.catch(() => docs.delete(k));
  }
  return p;
}

export async function pdfPageCount(file: File): Promise<number> {
  return (await openPdf(file)).numPages;
}

/** Text of pages from..to (1-based, inclusive), each marked with its page number. */
export async function pdfText(file: File, from: number, to: number): Promise<string> {
  const doc = await openPdf(file);
  const last = Math.min(doc.numPages, to);
  const out: string[] = [];
  for (let n = Math.max(1, from); n <= last; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    // Group the pieces into lines by their vertical position, which keeps boxes and labels readable.
    const rows = new Map<number, Array<{ x: number; s: string }>>();
    for (const it of content.items) {
      if (!('str' in it) || !it.str.trim()) continue;
      const y = Math.round(it.transform[5] / 4);
      (rows.get(y) ?? rows.set(y, []).get(y)!).push({ x: it.transform[4], s: it.str });
    }
    const lines = [...rows.entries()].sort((a, b) => b[0] - a[0]).map(([, r]) => r.sort((a, b) => a.x - b.x).map((p) => p.s).join(' ').replace(/\s+/g, ' ').trim());
    out.push(`[page ${n}]\n${lines.join('\n')}`);
  }
  return out.join('\n\n');
}
