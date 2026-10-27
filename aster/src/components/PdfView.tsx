// Aster's own PDF reader: zoom, page jump, night and sepia reading, brightness, selectable text, and a pop-up that turns
// selected text into a flashcard or a question for the AI tutor. Pages are drawn only as you scroll to them.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Minus, Moon, Plus, Sparkles, Sun, BookOpen, Layers, ScanLine } from 'lucide-react';
import { TextLayer, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist';
import { openPdf } from '../lib/pdftext';
import { effectivePdfTheme, setViewerPrefs, useViewerPrefs, type PdfTheme } from '../lib/viewerPrefs';
import { cx } from '../lib/dates';

export interface PdfActions { onCard?: (text: string) => void; onAsk?: (text: string) => void }

const THEMES: Array<{ id: PdfTheme; label: string; icon: typeof Sun }> = [
  { id: 'auto', label: 'Auto', icon: ScanLine }, { id: 'light', label: 'Light', icon: Sun }, { id: 'sepia', label: 'Sepia', icon: BookOpen }, { id: 'night', label: 'Night', icon: Moon },
];
const canvasFilter = (theme: 'light' | 'night' | 'sepia', bright: number) =>
  `${theme === 'night' ? 'invert(.9) hue-rotate(180deg) ' : theme === 'sepia' ? 'sepia(.5) ' : ''}brightness(${bright})`;

export function PdfView({ file, onCard, onAsk }: { file: File } & PdfActions) {
  const prefs = useViewerPrefs();
  const theme = effectivePdfTheme(prefs.pdfTheme);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [err, setErr] = useState('');
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(1);
  const [pick, setPick] = useState<{ text: string; x: number; y: number } | null>(null);
  const [panel, setPanel] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    setDoc(null); setErr(''); setPage(1);
    openPdf(file).then((d) => live && setDoc(d)).catch((e) => live && setErr(e instanceof Error ? e.message : 'Could not read this PDF.'));
    return () => { live = false; };
  }, [file]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.floor(el.clientWidth)));
    ro.observe(el);
    setWidth(Math.floor(el.clientWidth));
    return () => ro.disconnect();
  }, []);

  const onScroll = useCallback(() => {
    const sc = scroller.current;
    if (!sc) return;
    const mid = sc.getBoundingClientRect().top + sc.clientHeight * 0.3;
    let cur = 1;
    sc.querySelectorAll<HTMLElement>('[data-page]').forEach((p) => { if (p.getBoundingClientRect().top <= mid) cur = Number(p.dataset.page); });
    setPage(cur);
  }, []);

  const jump = (n: number) => {
    if (!doc) return;
    const c = Math.min(doc.numPages, Math.max(1, n));
    scroller.current?.querySelector<HTMLElement>(`[data-page="${c}"]`)?.scrollIntoView({ block: 'start' });
    setPage(c);
  };

  const readSelection = () => {
    const s = window.getSelection();
    const text = s?.toString().replace(/\s+/g, ' ').trim() ?? '';
    if (!s || s.rangeCount === 0 || text.length < 3 || !scroller.current?.contains(s.anchorNode)) { setPick(null); return; }
    const r = s.getRangeAt(0).getBoundingClientRect();
    const host = wrap.current!.getBoundingClientRect();
    setPick({ text: text.slice(0, 1500), x: Math.max(8, Math.min(host.width - 220, r.left - host.left)), y: Math.max(48, r.top - host.top - 44) });
  };

  const zoom = (d: number) => setViewerPrefs({ pdfZoom: Math.min(3, Math.max(0.6, Math.round((prefs.pdfZoom + d) * 10) / 10)) });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || e.ctrlKey || e.metaKey || !wrap.current?.matches(':hover, :focus-within')) return;
      if (e.key === '+' || e.key === '=') zoom(0.1); else if (e.key === '-') zoom(-0.1);
      else if (e.key === 'n') setViewerPrefs({ pdfTheme: theme === 'night' ? 'light' : 'night' });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  return (
    <div className={cx('pdfview', `pdfview--${theme}`)} ref={wrap}>
      <div className="pdfbar" role="toolbar" aria-label="PDF tools">
        <button type="button" className="iconbtn iconbtn--sm" aria-label="Zoom out" onClick={() => zoom(-0.1)}><Minus size={15} /></button>
        <button type="button" className="pdfbar__zoom" aria-label="Fit to width" title="Fit to width" onClick={() => setViewerPrefs({ pdfZoom: 1 })}>{Math.round(prefs.pdfZoom * 100)}%</button>
        <button type="button" className="iconbtn iconbtn--sm" aria-label="Zoom in" onClick={() => zoom(0.1)}><Plus size={15} /></button>
        <span className="pdfbar__sep" />
        <label className="pdfbar__page">
          <input type="number" min={1} max={doc?.numPages ?? 1} value={page} aria-label="Page number" onChange={(e) => jump(Number(e.target.value))} />
          <span>/ {doc?.numPages ?? '–'}</span>
        </label>
        <span className="pdfbar__sep" />
        <div className="seg" role="group" aria-label="Reading mode">
          {THEMES.map(({ id, label, icon: I }) => (
            <button key={id} type="button" className={cx('seg__btn', prefs.pdfTheme === id && 'is-on')} aria-pressed={prefs.pdfTheme === id} onClick={() => setViewerPrefs({ pdfTheme: id })} title={id === 'auto' ? 'Follow the app: night pages in dark mode (N toggles night)' : `${label} reading (N toggles night)`}><I size={14} /><span className="pdfbar__lbl">{label}</span></button>
          ))}
        </div>
        <button type="button" className={cx('iconbtn iconbtn--sm', panel && 'is-on')} aria-label="Brightness" aria-pressed={panel} onClick={() => setPanel(!panel)}><ScanLine size={15} /></button>
        {panel && (
          <label className="pdfbar__bright">
            <Layers size={13} aria-hidden="true" />
            <input type="range" min={0.5} max={1.2} step={0.05} value={prefs.pdfBright} aria-label="Page brightness" onChange={(e) => setViewerPrefs({ pdfBright: Number(e.target.value) })} />
          </label>
        )}
      </div>

      <div className="pdfscroll" ref={scroller} onScroll={onScroll} onMouseUp={readSelection} onTouchEnd={() => window.setTimeout(readSelection, 250)} onKeyUp={readSelection}>
        {!doc && !err && <div className="lib__loading"><Loader2 size={18} className="spin" /> Reading PDF</div>}
        {err && <div className="errtext" role="alert">{err}</div>}
        {doc && width > 0 && Array.from({ length: doc.numPages }, (_, i) => (
          <PdfPage key={i} doc={doc} n={i + 1} width={Math.max(240, width - 28) * prefs.pdfZoom} filter={canvasFilter(theme, prefs.pdfBright)} night={theme === 'night'} />
        ))}
      </div>

      {pick && (onCard || onAsk) && (
        <div className="selpop" style={{ left: pick.x, top: pick.y }} role="toolbar" aria-label="Selected text">
          {onCard && <button type="button" className="btn btn--sm" onMouseDown={(e) => e.preventDefault()} onClick={() => { onCard(pick.text); setPick(null); window.getSelection()?.removeAllRanges(); }}>Make flashcard</button>}
          {onAsk && <button type="button" className="btn btn--sm btn--ghost" onMouseDown={(e) => e.preventDefault()} onClick={() => { onAsk(pick.text); setPick(null); window.getSelection()?.removeAllRanges(); }}><Sparkles size={13} />Ask AI</button>}
        </div>
      )}
    </div>
  );
}

function PdfPage({ doc, n, width, filter, night }: { doc: PDFDocumentProxy; n: number; width: number; filter: string; night: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(n <= 2);
  const [ratio, setRatio] = useState(1.414);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) setNear(true); }, { rootMargin: '900px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!near) return;
    let task: RenderTask | undefined;
    let layer: TextLayer | undefined;
    let gone = false;
    (async () => {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      if (gone) return;
      setRatio(base.height / base.width);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const scale = width / base.width;
      const vp = page.getViewport({ scale: scale * dpr });
      const c = canvas.current;
      if (!c) return;
      c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
      c.style.width = `${width}px`; c.style.height = `${Math.floor(vp.height / dpr)}px`;
      task = page.render({ canvasContext: c.getContext('2d')!, viewport: vp });
      const t = text.current;
      if (t) {
        t.replaceChildren();
        t.style.setProperty('--scale-factor', String(scale));
        layer = new TextLayer({ textContentSource: page.streamTextContent(), container: t, viewport: page.getViewport({ scale }) });
        void layer.render().catch(() => { /* cancelled */ });
      }
      await task.promise;
    })().catch(() => { /* cancelled while scrolling */ });
    return () => { gone = true; task?.cancel(); layer?.cancel(); };
  }, [near, doc, n, width]);

  return (
    <div className="pdfpage" ref={box} style={{ width, height: Math.floor(width * ratio) }} data-page={n}>
      <canvas ref={canvas} style={{ filter }} />
      <div className={cx('textLayer', night && 'textLayer--night')} ref={text} />
      <span className="pdfpage__n">{n} / {doc.numPages}</span>
    </div>
  );
}
