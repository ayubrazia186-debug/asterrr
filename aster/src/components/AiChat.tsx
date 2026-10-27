import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpenCheck, CalendarCheck, Check, ExternalLink, Layers, Loader2, Send, Sparkles, Square, Trash2 } from 'lucide-react';
import type { SubjectId } from '../types';
import { subjectMeta } from '../data/subjects';
import { useStore } from '../state/store';
import { AiError, newKeyId, parseCards, PROVIDER_NAME, saveAi, streamChat, systemPrompt, getAi, usableKeys, useAi, type AiKey, type ChatMessage, type Provider } from '../lib/ai';
import { buildStudentContext, wrapContext } from '../lib/aiContext';
import { useLibrary } from '../lib/useLibrary';
import { useLast } from '../lib/last';
import { cx, uid } from '../lib/dates';
import { Rich } from './Rich';

/** What the tutor can read: the file open next to it. */
export interface DocContext {
  id: string;
  label: string;
  pages: () => Promise<number>;
  load: (from: number, to: number) => Promise<string>;
}

interface Msg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  cards?: Array<{ front: string; back: string; on: boolean }>;
  added?: boolean;
  failed?: boolean;
}

const MAX_CHARS = 36_000;
const histKey = (s: SubjectId) => `aster.chat.${s}`;
const loadHist = (s: SubjectId): Msg[] => { try { return (JSON.parse(localStorage.getItem(histKey(s)) ?? '[]') as Msg[]).filter((m) => !m.failed); } catch { return []; } };

const CHIPS = [
  { label: 'Summarise', text: 'Summarise this in 6 short bullet points for revision.' },
  { label: 'Quiz me', text: 'Ask me 5 exam-style questions on this, one at a time. Give only question 1 now and wait for my answer before the next.' },
  { label: 'Explain simply', text: 'Explain the main idea in very simple words, then give one worked example.' },
  { label: 'Key terms', text: 'List the key terms with a one-line definition for each, worded the way a mark scheme would word it.' },
];
const PLAN_CHIPS = [
  { label: 'What today?', text: 'Looking at my planner and progress, what should I study today, in what order, and roughly how long should each part take?' },
  { label: 'Plan my week', text: 'Using my planner and what I am behind on, make a realistic plan for the next 7 days. Say what to catch up on first.' },
  { label: 'How am I doing?', text: 'How am I doing in this subject? Give me my honest progress, what is slipping, and the 3 things to do next.' },
];
const CTX_KEY = 'aster.ai.ctx';
const loadCtx = (): { on: boolean; others: boolean } => { try { return { on: true, others: false, ...(JSON.parse(localStorage.getItem(CTX_KEY) ?? '{}') as object) }; } catch { return { on: true, others: false }; } };
const CARD_PROMPT = 'Make up to 10 revision flashcards from this. Reply with ONLY a JSON array, no other text, like [{"front":"question","back":"short answer"}]. Keep each back under 25 words.';

export function AiChat({ subject, doc, deck, fill = false, prefill }: { subject: SubjectId; doc?: DocContext | null; deck?: string; fill?: boolean; prefill?: string }) {
  const ai = useAi();
  const { addCards, notify, plan, cards, papers, notes, marks, assign } = useStore();
  const lib = useLibrary();
  const last = useLast();
  const [ctxOpt, setCtxOpt] = useState(loadCtx);
  const [usedBy, setUsedBy] = useState('');
  const setCtx = (patch: Partial<{ on: boolean; others: boolean }>) => { const n = { ...ctxOpt, ...patch }; setCtxOpt(n); try { localStorage.setItem(CTX_KEY, JSON.stringify(n)); } catch { /* ignore */ } };
  const briefing = useMemo(() => (ctxOpt.on ? buildStudentContext(subject, { plan, cards, papers, notes, marks, assign, trees: lib.trees }, ctxOpt.others, last && last.subject === subject ? `The student last studied the topic "${last.title}".` : undefined) : ''), [ctxOpt, subject, plan, cards, papers, notes, marks, assign, lib.trees, last]);
  const meta = subjectMeta(subject);
  const [msgs, setMsgs] = useState<Msg[]>(() => loadHist(subject));
  const [input, setInput] = useState('');
  useEffect(() => { if (prefill) setInput(prefill); }, [prefill]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [include, setInclude] = useState(true);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(12);
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const [draftKey, setDraftKey] = useState('');

  useEffect(() => { setMsgs(loadHist(subject)); }, [subject]);
  useEffect(() => {
    const t = window.setTimeout(() => {
      try { localStorage.setItem(histKey(subject), JSON.stringify(msgs.filter((m) => !m.failed).slice(-40))); } catch { /* chat history is a convenience */ }
    }, 300);
    return () => window.clearTimeout(t);
  }, [msgs, subject]);

  useEffect(() => {
    let live = true;
    setPageCount(null);
    if (!doc) return;
    doc.pages().then((n) => { if (live) { setPageCount(n); setFrom(1); setTo(Math.min(n, 12)); } }).catch(() => { if (live) setPageCount(1); });
    return () => { live = false; };
  }, [doc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  const patchLast = (fn: (m: Msg) => Msg) => setMsgs((all) => all.map((m, i) => (i === all.length - 1 ? fn(m) : m)));

  const send = useCallback(async (text: string, mode: 'chat' | 'cards' = 'chat') => {
    const q = text.trim();
    if (!q || busy) return;
    setErr('');
    const settings = { ...ai };
    let notes = '';
    let cut = false;
    if (doc && include) {
      try {
        notes = await doc.load(from, to);
        if (notes.length > MAX_CHARS) { notes = notes.slice(0, MAX_CHARS); cut = true; }
      } catch (e) {
        setErr(`Could not read "${doc.label}": ${e instanceof Error ? e.message : 'unknown error'}. Asking without it.`);
      }
    }
    const system = systemPrompt(subject) + (briefing ? wrapContext(briefing) : '') + (notes
      ? `\n\nThe student has "${doc!.label}" open${pageCount && pageCount > 1 ? ` (pages ${from} to ${to} of ${pageCount})` : ''}${cut ? ' (shortened)' : ''}. Its text, which may read out of order because notes contain boxes and arrows:\n<notes>\n${notes}\n</notes>`
      : '');
    const history: ChatMessage[] = msgs.filter((m) => !m.failed && !m.cards).slice(-10).map((m) => ({ role: m.role, content: m.content }));
    const userMsg: Msg = { id: uid(), role: 'user', content: mode === 'cards' ? 'Make flashcards from this.' : q };
    setMsgs((all) => [...all, userMsg, { id: uid(), role: 'assistant', content: '' }]);
    setInput('');
    setBusy(true);
    const ctl = new AbortController();
    abort.current = ctl;
    try {
      const reply = await streamChat({
        settings,
        signal: ctl.signal,
        onKey: (k) => setUsedBy(`${k.label || PROVIDER_NAME[k.provider]}`),
        messages: [{ role: 'system', content: system }, ...history, { role: 'user', content: q }],
        onDelta: (d) => { if (mode === 'chat') patchLast((m) => ({ ...m, content: m.content + d })); },
      });
      if (mode === 'cards') {
        const cards = parseCards(reply);
        patchLast((m) => cards.length
          ? { ...m, content: `I made ${cards.length} card${cards.length === 1 ? '' : 's'}. Untick any you do not want, then add them.`, cards: cards.map((c) => ({ ...c, on: true })) }
          : { ...m, content: 'The model did not return cards in a form I could read. Try again, or choose another model in Settings.', failed: true });
      }
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') {
        patchLast((m) => (m.content ? m : { ...m, content: 'Stopped.', failed: true }));
      } else {
        const msg = e instanceof AiError ? e.message : 'Something went wrong talking to the AI.';
        setErr(msg);
        setMsgs((all) => (all.length && all[all.length - 1].role === 'assistant' && !all[all.length - 1].content ? all.slice(0, -1) : all));
      }
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }, [ai, briefing, busy, doc, from, include, msgs, pageCount, subject, to]); // eslint-disable-line react-hooks/exhaustive-deps

  const chip = (text: string) => {
    if (doc && include) void send(text);
    else { setInput(text.replace(/ this\b/, ' [topic]')); box.current?.focus(); }
  };

  if (!usableKeys(ai).length) return <KeySetup fill={fill} />;

  const cardsDeck = deck ?? doc?.label.replace(/\.[^.]+$/, '') ?? `${meta.name} AI cards`;
  const showRange = Boolean(doc && include && pageCount && pageCount > 12);

  return (
    <div className={cx('aichat', fill && 'aichat--fill')}>
      <div className="aichat__scroll" ref={scroller} aria-live="polite">
        {msgs.length === 0 && (
          <div className="aichat__hello">
            <Sparkles size={22} strokeWidth={1.7} />
            <p><strong>Ask me anything in {meta.name}.</strong><br />{doc ? 'I can read the file you have open.' : 'Open a PDF from Notes, then ask about it from there.'}</p>
          </div>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={cx('msg', `msg--${m.role}`, m.failed && 'msg--failed')}>
            {m.role === 'assistant' ? (m.content ? <Rich text={m.content} /> : <span className="typing" aria-label="Thinking"><i /><i /><i /></span>) : <p>{m.content}</p>}
            {m.cards && (
              <div className="proposal">
                <ul>
                  {m.cards.map((c, i) => (
                    <li key={i}>
                      <label>
                        <input type="checkbox" checked={c.on} disabled={m.added} onChange={() => setMsgs((all) => all.map((x) => (x.id === m.id ? { ...x, cards: x.cards!.map((y, j) => (j === i ? { ...y, on: !y.on } : y)) } : x)))} />
                        <span><strong>{c.front}</strong><br /><span className="muted">{c.back}</span></span>
                      </label>
                    </li>
                  ))}
                </ul>
                <button
                  type="button" className="btn btn--sm" disabled={m.added || !m.cards.some((c) => c.on)}
                  onClick={() => {
                    const chosen = m.cards!.filter((c) => c.on);
                    addCards(chosen.map((c) => ({ subject, deck: cardsDeck, front: c.front, back: c.back })));
                    setMsgs((all) => all.map((x) => (x.id === m.id ? { ...x, added: true } : x)));
                    notify(`${chosen.length} card${chosen.length === 1 ? '' : 's'} added to Flashcards`);
                  }}
                >
                  {m.added ? <><Check size={14} />Added</> : <><Layers size={14} />Add {m.cards.filter((c) => c.on).length} to Flashcards</>}
                </button>
              </div>
            )}
          </div>
        ))}
        {err && <div className="aichat__err" role="alert">{err}</div>}
      </div>

      {ctxOpt.on && (
        <div className="aichat__chips">
          {PLAN_CHIPS.map((c) => <button key={c.label} type="button" className="chipbtn" disabled={busy} onClick={() => void send(c.text)}><CalendarCheck size={13} />{c.label}</button>)}
        </div>
      )}
      <div className="aichat__chips">
        {CHIPS.map((c) => <button key={c.label} type="button" className="chipbtn" disabled={busy} onClick={() => chip(c.text)}>{c.label}</button>)}
        <button type="button" className="chipbtn chipbtn--cards" disabled={busy || !(doc && include)} title={doc ? 'Turn this file into flashcards' : 'Open a file first'} onClick={() => void send(CARD_PROMPT, 'cards')}><Layers size={13} />Make flashcards</button>
      </div>

      <div className="aichat__ctx aichat__ctx--plan">
        <label className="aichat__incl">
          <input type="checkbox" checked={ctxOpt.on} onChange={(e) => setCtx({ on: e.target.checked })} />
          <CalendarCheck size={14} />
          <span>Let the AI see my planner, progress, cards and file names</span>
        </label>
        {ctxOpt.on && (
          <label className="aichat__incl aichat__incl--sub">
            <input type="checkbox" checked={ctxOpt.others} onChange={(e) => setCtx({ others: e.target.checked })} />
            <span>and a summary of my other subjects</span>
          </label>
        )}
        {ctxOpt.on && (
          <details className="aichat__seen">
            <summary>See exactly what is shared</summary>
            <pre>{briefing}</pre>
            <p className="muted">Recording links and passcodes are never included. Sent to the provider when you ask.</p>
          </details>
        )}
      </div>

      {doc && (
        <div className="aichat__ctx">
          <label className="aichat__incl">
            <input type="checkbox" checked={include} onChange={(e) => setInclude(e.target.checked)} />
            <BookOpenCheck size={14} />
            <span title={doc.label}>Read “{doc.label.replace(/\.[^.]+$/, '')}”</span>
          </label>
          {showRange && (
            <span className="aichat__range">
              pages
              <input type="number" min={1} max={pageCount!} value={from} aria-label="From page" onChange={(e) => setFrom(Math.max(1, Math.min(+e.target.value || 1, to)))} />
              to
              <input type="number" min={from} max={pageCount!} value={to} aria-label="To page" onChange={(e) => setTo(Math.min(pageCount!, Math.max(+e.target.value || from, from)))} />
              of {pageCount}
            </span>
          )}
          {include && <span className="muted aichat__fine">Sent to the AI when you ask.</span>}
        </div>
      )}

      <form className="aichat__form" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
        <textarea
          ref={box} rows={2} value={input} placeholder={`Ask about ${meta.name}…`} aria-label="Your question"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input); } }}
        />
        {busy
          ? <button type="button" className="btn btn--danger" onClick={() => abort.current?.abort()} aria-label="Stop"><Square size={15} fill="currentColor" /></button>
          : <button type="submit" className="btn" disabled={!input.trim()} aria-label="Send"><Send size={16} /></button>}
      </form>
      <div className="aichat__foot">
        <span className="muted">{usedBy ? `${usedBy} · ` : ''}temperature {ai.temperature}{usableKeys(ai).length > 1 ? ` · ${usableKeys(ai).length} keys` : ''}</span>
        {msgs.length > 0 && <button type="button" className="linkbtn" onClick={() => { if (!busy) { setMsgs([]); setErr(''); } }}><Trash2 size={12} />Clear chat</button>}
        {busy && <Loader2 size={13} className="spin" aria-hidden="true" />}
      </div>
    </div>
  );
}

/** First-time setup: pick a provider and paste a key. More keys can be added in Settings. */
function KeySetup({ fill }: { fill: boolean }) {
  const { notify } = useStore();
  const [provider, setProvider] = useState<Provider>('gemini');
  const [draft, setDraft] = useState('');
  const link = provider === 'gemini' ? 'https://aistudio.google.com/apikey' : 'https://openrouter.ai/keys';
  return (
    <div className={cx('aichat', fill && 'aichat--fill')}>
      <div className="aichat__setup">
        <div className="lib-empty__art" aria-hidden="true"><Sparkles size={34} strokeWidth={1.6} /></div>
        <h3>Connect an AI</h3>
        <div className="seg" role="group" aria-label="Provider">
          {(['gemini', 'openrouter'] as Provider[]).map((p) => <button key={p} type="button" className={cx('seg__btn', provider === p && 'is-on')} aria-pressed={provider === p} onClick={() => setProvider(p)}>{PROVIDER_NAME[p]}</button>)}
        </div>
        <p className="muted">Get a key at <a href={link} target="_blank" rel="noopener noreferrer">{link.replace('https://', '')}<ExternalLink size={12} /></a>. It is saved only in this browser and sent only to {PROVIDER_NAME[provider]}. You can add more keys (for example from your other accounts) in <Link to="/settings">Settings</Link>.</p>
        <form onSubmit={(e) => {
          e.preventDefault();
          const k = draft.trim();
          if (!k) return;
          const key: AiKey = { id: newKeyId(), label: `${PROVIDER_NAME[provider]} 1`, provider, key: k, on: true };
          saveAi({ keys: [...getKeys(), key] });
          setDraft(''); notify('Key saved on this device');
        }}>
          <input className="input" type="password" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={provider === 'gemini' ? 'AIza…' : 'sk-or-v1-…'} autoComplete="off" spellCheck={false} aria-label={`${PROVIDER_NAME[provider]} key`} />
          <button type="submit" className="btn" disabled={!draft.trim()}>Save key</button>
        </form>
      </div>
    </div>
  );
}
const getKeys = () => getAi().keys;
