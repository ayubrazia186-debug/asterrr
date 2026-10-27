// The study view: opens PDFs, images, notes and videos right inside Aster. A video and a set of notes can sit side by side,
// and the AI tutor can read the notes that are open.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft, ChevronRight, Download, ExternalLink, File as FileIcon, FileText, Loader2, PanelLeft, Sparkles, Video, X, Columns2,
} from 'lucide-react';
import type { FNode, SubjectId } from '../types';
import { useStore } from '../state/store';
import { extOf, fileUrl, isServer, kindOf, mimeFor, prepareVideo, prettyName, readFile, type LibKey } from '../lib/folders';
import { effectivePdfTheme, setViewerPrefs, useViewerPrefs } from '../lib/viewerPrefs';
import { pdfPageCount, pdfText } from '../lib/pdftext';
import { getResume, setResume } from '../lib/resume';
import { cx } from '../lib/dates';
import { ExtBadge, PenTick } from './ui';
import { AiChat, type DocContext } from './AiChat';
import { PdfView } from './PdfView';
import { clock, qualityLabel, useAudioBoost, VideoBar } from './VideoTools';

export interface StudyItem { node: FNode; group: string }

const isMedia = (n: FNode) => ['video', 'audio'].includes(kindOf(n.name));

export function Study({
  libraryKey, subject, title, items, start, beside, onClose,
}: { libraryKey: LibKey; subject: SubjectId; title: string; items: StudyItem[]; start: string; beside?: string; onClose: () => void }) {
  const { marks, toggleMark, setMark, notify, addCards } = useStore();
  const done = useMemo(() => new Set(marks[libraryKey] ?? []), [marks, libraryKey]);
  const byPath = useMemo(() => new Map(items.map((i) => [i.node.path, i.node])), [items]);
  const first = byPath.get(start) ?? items[0]?.node;
  const [videoPath, setVideoPath] = useState<string | null>(first && isMedia(first) ? first.path : null);
  const [docPath, setDocPath] = useState<string | null>(first && !isMedia(first) ? first.path : null);
  const [docPath2, setDocPath2] = useState<string | null>(beside ?? null);
  const [current, setCurrent] = useState<string>(first?.path ?? '');
  const [focus, setFocus] = useState<'both' | 'video' | 'doc'>('both');
  const [rail, setRail] = useState(() => window.innerWidth > 980);
  const [ai, setAi] = useState(false);
  const [askText, setAskText] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);

  const open = useCallback((n: FNode) => {
    if (isMedia(n)) setVideoPath(n.path); else setDocPath(n.path);
    setCurrent(n.path);
    setFocus('both');
    if (window.innerWidth <= 980) setRail(false);
  }, []);

  const idx = items.findIndex((i) => i.node.path === current);
  const go = (d: number) => { const n = items[idx + d]; if (n) open(n.node); };

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === 'Escape' && !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const vNode = videoPath ? byPath.get(videoPath) ?? null : null;
  const dNode = docPath ? byPath.get(docPath) ?? null : null;
  const d2Node = docPath2 ? byPath.get(docPath2) ?? null : null;
  const cur = byPath.get(current);

  const aiDoc = useMemo<DocContext | null>(() => {
    if (!dNode) return null;
    const k = kindOf(dNode.name);
    if (k !== 'pdf' && k !== 'text') return null;
    const path = dNode.path;
    return {
      id: path,
      label: dNode.name,
      pages: async () => (k === 'pdf' ? pdfPageCount(await readFile(libraryKey, path)) : 1),
      load: async (a, b) => { const f = await readFile(libraryKey, path); return k === 'pdf' ? pdfText(f, a, b) : (await f.text()); },
    };
  }, [dNode?.path, libraryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => {
    const g: Array<{ label: string; rows: StudyItem[] }> = [];
    for (const it of items) {
      const last = g[g.length - 1];
      if (last && last.label === it.group) last.rows.push(it); else g.push({ label: it.group, rows: [it] });
    }
    return g;
  }, [items]);

  const makeCard = useCallback((text: string) => {
    addCards([{ subject, deck: title, front: text.length > 140 ? `${text.slice(0, 137)}…` : text, back: '' }]);
    notify('Added to your flashcards. Open the Flashcards tab to write the answer.');
  }, [addCards, subject, title, notify]);
  const askAbout = useCallback((text: string) => { setAskText(`Explain this from my notes in simple words: "${text}"`); setAi(true); }, []);
  const theater = focus === 'video';
  const toggleTheater = () => { setFocus(theater ? 'both' : 'video'); setRail(theater ? window.innerWidth > 980 : false); };
  const both = Boolean(vNode && dNode);
  const split = both || Boolean(dNode && d2Node);

  return createPortal(
    <div className="sv" role="dialog" aria-modal="true" aria-label={`Study: ${title}`}>
      <header className="sv__head">
        <button type="button" className={cx('iconbtn', rail && 'is-on')} aria-label={rail ? 'Hide file list' : 'Show file list'} aria-pressed={rail} onClick={() => setRail(!rail)}><PanelLeft size={18} /></button>
        <div className="sv__title">
          <strong>{title}</strong>
          <span className="muted">{cur ? prettyName(cur.name) : 'Nothing open'}{idx >= 0 ? `, ${idx + 1} of ${items.length}` : ''}</span>
        </div>
        <div className="sv__tools">
          {both && (
            <div className="seg" role="group" aria-label="Layout">
              <button type="button" className={cx('seg__btn', focus === 'video' && 'is-on')} onClick={() => setFocus('video')}><Video size={14} />Video</button>
              <button type="button" className={cx('seg__btn', focus === 'both' && 'is-on')} onClick={() => setFocus('both')}><Columns2 size={14} />Both</button>
              <button type="button" className={cx('seg__btn', focus === 'doc' && 'is-on')} onClick={() => setFocus('doc')}><FileText size={14} />Notes</button>
            </div>
          )}
          {cur && (
            <button type="button" className={cx('btn btn--sm', done.has(cur.path) ? '' : 'btn--ghost')} aria-pressed={done.has(cur.path)} onClick={() => toggleMark(libraryKey, cur.path)}>
              {done.has(cur.path) ? <><PenTick size={14} />Done</> : 'Mark done'}
            </button>
          )}
          <button type="button" className="iconbtn" aria-label="Previous file" disabled={idx <= 0} onClick={() => go(-1)}><ChevronLeft size={18} /></button>
          <button type="button" className="iconbtn" aria-label="Next file" disabled={idx < 0 || idx >= items.length - 1} onClick={() => go(1)}><ChevronRight size={18} /></button>
          <button type="button" className={cx('btn btn--sm sv__aibtn', ai ? '' : 'btn--ghost')} aria-pressed={ai} onClick={() => setAi(!ai)}><Sparkles size={15} />Ask AI</button>
          <button ref={closeRef} type="button" className="iconbtn" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
      </header>

      <div className={cx('sv__body', rail && 'has-rail', ai && 'has-ai')}>
        {rail && (
          <nav className="sv__rail" aria-label="Files">
            {groups.map((g, gi) => (
              <div key={gi} className="sv__group">
                {g.label && <div className="sv__glabel">{g.label}</div>}
                <ul>
                  {g.rows.map(({ node }) => (
                    <li key={node.path}>
                      <button type="button" className={cx('rail-file', (node.path === videoPath || node.path === docPath || node.path === docPath2) && 'is-open', node.path === current && 'is-current')} onClick={() => open(node)}>
                        <ExtBadge name={node.name} />
                        <span>{prettyName(node.name)}</span>
                        {done.has(node.path) && <span className="rail-file__tick"><PenTick size={14} /></span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {both && <p className="muted sv__hint">Click a video and a PDF to see them side by side.</p>}
          </nav>
        )}

        <div className={cx('sv__panes', split && focus === 'both' && 'is-split')}>
          {!vNode && !dNode && <div className="sv__none"><FileIcon size={40} strokeWidth={1.3} /><p>Pick a file on the left.</p></div>}
          {vNode && focus !== 'doc' && (
            <section className="pane pane--video" aria-label="Video">
              <MediaPane key={vNode.path} libraryKey={libraryKey} node={vNode} onClose={() => { setVideoPath(null); setFocus('both'); }} theater={theater} onTheater={toggleTheater} onEnded={() => { if (!done.has(vNode.path)) { setMark(libraryKey, vNode.path, true); notify(`Finished: ${prettyName(vNode.name)}`); } }} />
            </section>
          )}
          {dNode && focus !== 'video' && (
            <section className="pane pane--doc" aria-label="Notes">
              <DocPane key={dNode.path} libraryKey={libraryKey} node={dNode} onClose={() => { setDocPath(null); setFocus('both'); }} onCard={makeCard} onAsk={askAbout} />
            </section>
          )}
          {d2Node && focus !== 'video' && (
            <section className="pane pane--doc" aria-label="Second document">
              <DocPane key={d2Node.path} libraryKey={libraryKey} node={d2Node} onClose={() => setDocPath2(null)} onCard={makeCard} onAsk={askAbout} />
            </section>
          )}
        </div>

        {ai && (
          <aside className="sv__ai" aria-label="AI tutor">
            <div className="sv__aihead"><Sparkles size={16} /><strong>AI tutor</strong><button type="button" className="iconbtn" aria-label="Close AI tutor" onClick={() => setAi(false)}><X size={16} /></button></div>
            {!aiDoc && <p className="muted sv__ainote">{dNode ? 'The tutor can read PDFs and text files, not this type.' : 'Open a PDF so the tutor can read it. Videos cannot be read.'}</p>}
            <AiChat subject={subject} doc={aiDoc} deck={title} fill prefill={askText} />
          </aside>
        )}
      </div>
    </div>,
    document.body,
  );
}

function PaneHead({ node, onClose, children }: { node: FNode; onClose: () => void; children?: ReactNode }) {
  return (
    <div className="pane__head">
      <ExtBadge name={node.name} />
      <span className="pane__name">{prettyName(node.name)}</span>
      {children}
      <button type="button" className="iconbtn iconbtn--sm" aria-label={`Close ${prettyName(node.name)}`} onClick={onClose}><X size={15} /></button>
    </div>
  );
}

interface Loaded { url?: string; error?: string; loading: boolean; text?: string; file?: File }

function useFileUrl(libraryKey: LibKey, node: FNode, asText: boolean): Loaded {
  const [st, setSt] = useState<Loaded>({ loading: true });
  useEffect(() => {
    let url: string | undefined;
    let gone = false;
    setSt({ loading: true });
    readFile(libraryKey, node.path)
      .then(async (file) => {
        if (gone) return;
        if (asText) { setSt({ loading: false, text: (await file.text()).slice(0, 300_000) }); return; }
        // A Blob keeps pointing at the file on disk, so a long recording is not copied into memory.
        url = URL.createObjectURL(new Blob([file], { type: file.type || mimeFor(node.name) || 'application/octet-stream' }));
        setSt({ loading: false, url, file });
      })
      .catch((e) => !gone && setSt({ loading: false, error: e instanceof Error ? e.message : 'Could not open this file.' }));
    return () => { gone = true; if (url) URL.revokeObjectURL(url); };
  }, [libraryKey, node.path, asText]);
  return st;
}

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];

function MediaPane({ libraryKey, node, onClose, onEnded, theater, onTheater }: { libraryKey: LibKey; node: FNode; onClose: () => void; onEnded: () => void; theater: boolean; onTheater: () => void }) {
  const audio = kindOf(node.name) === 'audio';
  const rid = `${libraryKey}:${node.path}`;
  const prefs = useViewerPrefs();
  const [url, setUrl] = useState<{ url?: string; error?: string; loading: boolean; converted?: boolean }>({ loading: true });
  const [failed, setFailed] = useState(false);
  const [converting, setConverting] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [resumed, setResumed] = useState(0);
  const [res, setRes] = useState('');
  const el = useRef<HTMLVideoElement>(null);
  const lastSave = useRef(0);
  const unsupported = useAudioBoost(el, prefs.vBoost, prefs.voice, url.url);

  useEffect(() => {
    let u: string | undefined;
    let gone = false;
    setUrl({ loading: true }); setFailed(false); setRes('');
    // On a tablet the computer streams the file; otherwise the file is read from the folder you linked.
    const streamed = fileUrl(libraryKey, node.path);
    if (streamed) { setUrl({ loading: false, url: streamed }); return; }
    readFile(libraryKey, node.path)
      .then((file) => {
        if (gone) return;
        u = URL.createObjectURL(new Blob([file], { type: mimeFor(node.name) || file.type }));
        setUrl({ loading: false, url: u });
      })
      .catch((e) => !gone && setUrl({ loading: false, error: e instanceof Error ? e.message : 'Could not open this file.' }));
    return () => { gone = true; if (u) URL.revokeObjectURL(u); };
  }, [libraryKey, node.path, node.name]);

  // The browser could not play it. When the computer is serving Aster, ask it to convert the video to mp4 once.
  const onFail = () => {
    if (isServer() && !url.converted && !audio) {
      setConverting(true);
      prepareVideo(libraryKey, node.path)
        .then((u) => { setUrl({ loading: false, url: u, converted: true }); setFailed(false); })
        .catch((e) => { setUrl((p) => ({ ...p, error: e instanceof Error ? e.message : 'Could not convert this video.' })); setFailed(true); })
        .finally(() => setConverting(false));
      return;
    }
    setFailed(true);
  };

  useEffect(() => { if (el.current) el.current.playbackRate = speed; }, [speed, url.url]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const m = el.current;
      const t = e.target as HTMLElement;
      if (!m || /^(INPUT|TEXTAREA|SELECT|BUTTON|A|IFRAME)$/.test(t.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === ' ') { e.preventDefault(); if (m.paused) void m.play(); else m.pause(); }
      else if (e.key === 'j') m.currentTime = Math.max(0, m.currentTime - 10);
      else if (e.key === 'l') m.currentTime = Math.min(m.duration || Infinity, m.currentTime + 10);
      else if (e.key === 'm') m.muted = !m.muted;
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const Tag = (audio ? 'audio' : 'video') as 'video';
  return (
    <>
      <PaneHead node={node} onClose={onClose}>
        <div className="speeds" role="group" aria-label="Playback speed">
          {SPEEDS.map((s) => <button key={s} type="button" className={cx(s === speed && 'is-on')} onClick={() => setSpeed(s)}>{s}x</button>)}
        </div>
      </PaneHead>
      <div className={cx('pane__body pane__body--media', theater && 'is-theater')}>
        {(url.loading || converting) && <div className="lib__loading"><Loader2 size={18} className="spin" /> {converting ? 'Converting this video on your computer (once)' : 'Opening video'}</div>}
        {url.error && failed && <div className="errtext" role="alert">{url.error}</div>}
        {url.error && !failed && !converting && <div className="errtext" role="alert">{url.error}</div>}
        {url.url && !failed && !converting && (
          <Tag
            ref={el} className={cx('player', prefs.vFit === 'cover' && 'player--cover')} src={url.url} controls preload="metadata" playsInline
            style={!audio && prefs.vBright !== 1 ? { filter: `brightness(${prefs.vBright})` } : undefined}
            onLoadedMetadata={(e) => {
              const m = e.currentTarget;
              const at = getResume(rid);
              if (at > 5 && m.duration && at < m.duration - 15) { m.currentTime = at; setResumed(at); }
              m.playbackRate = speed;
              if (!audio) setRes(qualityLabel(m.videoHeight));
            }}
            onTimeUpdate={(e) => { const t = e.currentTarget.currentTime; if (Math.abs(t - lastSave.current) >= 3) { lastSave.current = t; setResume(rid, t); } }}
            onPause={(e) => setResume(rid, e.currentTarget.ended ? 0 : e.currentTarget.currentTime)}
            onEnded={() => { setResume(rid, 0); onEnded(); }}
            onError={onFail}
          />
        )}
        {resumed > 0 && !failed && <div className="resumed">Continued from {clock(resumed)}</div>}
        {url.url && !failed && !converting && <VideoBar vid={el} rid={rid} audio={audio} unsupported={unsupported} theater={theater} onTheater={onTheater} res={res} />}
        {failed && url.url && (
          <div className="reader__other player-fail" role="alert">
            <Video size={40} strokeWidth={1.4} />
            <p><strong>This browser cannot play this {extOf(node.name).toUpperCase()} inside the app.</strong></p>
            {isServer()
              ? <p className="muted">Your computer could not convert it either. Check that ffmpeg is installed on it (the window running Aster shows whether it is).</p>
              : <p className="muted">The recording probably uses a video format (such as HEVC) that Chrome does not include. Convert it once and Aster will play the new file:</p>}
            <code className="cmd">{`ffmpeg -i "${node.name}" -c:v libx264 -c:a aac "${prettyName(node.name)}.mp4"`}</code>
            <a className="btn btn--ghost btn--sm" href={url.url} download={node.name}><Download size={15} />Download this file</a>
          </div>
        )}
        <div className="player__keys muted">Space play or pause, J and L jump 10 s, M mute, B bookmark, T theater. Your place is remembered.</div>
      </div>
    </>
  );
}

function DocPane({ libraryKey, node, onClose, onCard, onAsk }: { libraryKey: LibKey; node: FNode; onClose: () => void; onCard?: (t: string) => void; onAsk?: (t: string) => void }) {
  const kind = kindOf(node.name);
  const prefs = useViewerPrefs();
  const st = useFileUrl(libraryKey, node, kind === 'text');
  // Aster's own reader is the default because it has night mode, zoom and selectable text. Some people prefer the browser's.
  const nativeOk = (navigator as Navigator & { pdfViewerEnabled?: boolean }).pdfViewerEnabled !== false;
  const builtin = prefs.builtin || !nativeOk;
  return (
    <>
      <PaneHead node={node} onClose={onClose}>
        {kind === 'pdf' && nativeOk && (
          <button type="button" className="btn btn--sm btn--ghost" aria-pressed={!builtin} onClick={() => setViewerPrefs({ builtin: !prefs.builtin })} title="Switch between Aster's reader and the browser's PDF viewer">{builtin ? 'Browser viewer' : 'Aster reader'}</button>
        )}
        {st.url && (kind === 'pdf' || kind === 'image') && (
          <a className="iconbtn iconbtn--sm" href={st.url} target="_blank" rel="noopener noreferrer" aria-label="Open in a new tab" title="Open in a new tab"><ExternalLink size={15} /></a>
        )}
      </PaneHead>
      <div className="pane__body">
        {st.loading && <div className="lib__loading"><Loader2 size={18} className="spin" /> Opening file</div>}
        {st.error && <div className="errtext" role="alert">{st.error}</div>}
        {st.url && kind === 'pdf' && (builtin && st.file
          ? <PdfView file={st.file} onCard={onCard} onAsk={onAsk} />
          : <iframe className={cx('reader__frame', effectivePdfTheme(prefs.pdfTheme) === 'night' && 'reader__frame--night')} src={`${st.url}#view=FitH`} title={prettyName(node.name)} />)}
        {st.url && kind === 'image' && <img className="reader__img" src={st.url} alt={prettyName(node.name)} />}
        {st.text !== undefined && <pre className="reader__text">{st.text}</pre>}
        {st.url && kind === 'other' && (
          <div className="reader__other">
            <FileIcon size={40} strokeWidth={1.4} />
            <p>Aster cannot show .{extOf(node.name)} files inside the app.</p>
            <a className="btn" href={st.url} download={node.name}><Download size={16} />Download to open</a>
          </div>
        )}
      </div>
    </>
  );
}
