import { merge3, startShared, type SharedData } from '../lib/shared';
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import seed from '../data/plan.seed.json';
import type {
  Card, ClassItem, FileLink, Mistake, Note, Paper, Persisted, PendingChange, PlanData, Settings, Steps, SubjectId, SyncState, TopicRef,
} from '../types';
import { pullPlan, pushChanges } from '../sync/client';
import { addDays, todayISO, uid } from '../lib/dates';

const KEY = 'aster.v2';

const defaultSettings: Settings = { name: '', examDate: '', syncUrl: '', syncToken: '' };

const initial = (): Persisted => ({
  v: 2,
  plan: seed as unknown as PlanData,
  pending: [],
  papers: [],
  mistakes: [],
  notes: [],
  files: [],
  cards: [],
  marks: {},
  assign: {},
  settings: defaultSettings,
  lastSync: null,
});

function load(): Persisted {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return initial();
    const p = JSON.parse(raw) as Persisted;
    if (p.v !== 2) return initial();
    return { ...initial(), ...p, settings: { ...defaultSettings, ...p.settings } };
  } catch {
    return initial();
  }
}

const sameSlot = (a: PendingChange, b: PendingChange) =>
  a.subject === b.subject && a.row === b.row && a.field === b.field;
const sameValue = (a: PendingChange, b: PendingChange) => JSON.stringify(a.value) === JSON.stringify(b.value);

/** Lays unsent local edits over a fresh copy of the sheet so they are never lost by a pull. */
function applyPending(plan: PlanData, pending: PendingChange[]): PlanData {
  if (!pending.length) return plan;
  const next: PlanData = { ...plan };
  for (const p of pending) {
    const sp = next[p.subject];
    if (!sp) continue;
    const idx = sp.classes.findIndex((c) => c.row === p.row && c.topic === p.topic && c.part === p.part);
    if (idx < 0) continue;
    const classes = sp.classes.slice();
    classes[idx] = p.field === 'steps' ? { ...classes[idx], steps: p.value as Steps } : { ...classes[idx], notes: p.value as string };
    next[p.subject] = { ...sp, classes };
  }
  return next;
}

interface Toast { id: string; text: string; tone: 'ok' | 'warn' }

interface Store {
  plan: PlanData;
  papers: Paper[];
  mistakes: Mistake[];
  notes: Note[];
  files: FileLink[];
  cards: Card[];
  marks: Record<string, string[]>;
  assign: Record<string, Record<string, TopicRef>>;
  settings: Settings;
  pendingCount: number;
  syncState: SyncState;
  syncError: string;
  lastSync: string | null;
  toast: Toast | null;
  setStep: (subject: SubjectId, c: ClassItem, step: number, value?: boolean) => void;
  setAllSteps: (subject: SubjectId, c: ClassItem, value: boolean) => void;
  setClassNotes: (subject: SubjectId, c: ClassItem, text: string) => void;
  syncNow: () => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => void;
  addPaper: (p: Omit<Paper, 'id'>) => void;
  deletePaper: (id: string) => void;
  addMistake: (m: Omit<Mistake, 'id' | 'updatedAt' | 'date' | 'fixed'>) => void;
  updateMistake: (id: string, patch: Partial<Pick<Mistake, 'topic' | 'text' | 'fix' | 'source' | 'fixed'>>) => void;
  deleteMistake: (id: string) => void;
  saveNote: (n: Omit<Note, 'id' | 'updatedAt'> & { id?: string }) => string;
  deleteNote: (id: string) => void;
  addFile: (f: Omit<FileLink, 'id'>) => void;
  deleteFile: (id: string) => void;
  addCards: (cards: Array<Pick<Card, 'subject' | 'deck' | 'front' | 'back'>>) => void;
  deleteCard: (id: string) => void;
  reviewCard: (id: string, grade: 'again' | 'good' | 'easy') => void;
  toggleMark: (key: string, path: string) => void;
  setMark: (key: string, path: string, on: boolean) => void;
  assignFile: (subject: SubjectId, path: string, ref: TopicRef | null) => void;
  exportBackup: () => string;
  importBackup: (raw: string) => boolean;
  resetLocal: () => void;
  notify: (text: string, tone?: Toast['tone']) => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Persisted>(load);
  const [syncState, setSyncState] = useState<SyncState>('off');
  const [syncError, setSyncError] = useState('');
  const [toast, setToast] = useState<Toast | null>(null);
  const latest = useRef(state);
  latest.current = state;
  const busy = useRef(false);
  const toastTimer = useRef<number>(0);

  // ---- persistence ---------------------------------------------------------
  useEffect(() => {
    const t = window.setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode: still works for this visit */ }
    }, 150);
    return () => window.clearTimeout(t);
  }, [state]);

  // Save straight away when the tab is hidden or closed, so a tick made a moment ago is never lost.
  useEffect(() => {
    const flush = () => { try { localStorage.setItem(KEY, JSON.stringify(latest.current)); } catch { /* private mode */ } };
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => { document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', flush); };
  }, []);

  // ---- shared between devices (only when Aster is opened from the library server) ----
  const sharedCtl = useRef<ReturnType<typeof startShared> | null>(null);
  useEffect(() => {
    const ctl = startShared(
      () => { const p = latest.current; return { cards: p.cards, notes: p.notes, papers: p.papers, mistakes: p.mistakes, files: p.files, marks: p.marks, assign: p.assign }; },
      // anything changed on this device while the network call was in flight is merged back in, not overwritten
      (d: SharedData, was: SharedData) => setState((p) => {
        const m = merge3(was, { cards: p.cards, notes: p.notes, papers: p.papers, mistakes: p.mistakes, files: p.files, marks: p.marks, assign: p.assign }, d) as SharedData;
        return { ...p, cards: m.cards as Persisted['cards'], notes: m.notes as Persisted['notes'], papers: m.papers as Persisted['papers'], mistakes: m.mistakes as Persisted['mistakes'], files: m.files as Persisted['files'], marks: m.marks, assign: m.assign as Persisted['assign'] };
      }),
    );
    sharedCtl.current = ctl;
    return () => { ctl.stop(); sharedCtl.current = null; };
  }, []);
  useEffect(() => { sharedCtl.current?.poke(); }, [state.cards, state.notes, state.papers, state.mistakes, state.files, state.marks, state.assign]);

  const notify = useCallback((text: string, tone: Toast['tone'] = 'ok') => {
    window.clearTimeout(toastTimer.current);
    setToast({ id: uid(), text, tone });
    toastTimer.current = window.setTimeout(() => setToast(null), 3600);
  }, []);

  // ---- sync ----------------------------------------------------------------
  const configured = Boolean(state.settings.syncUrl && state.settings.syncToken);

  const doPull = useCallback(async () => {
    const { settings } = latest.current;
    if (!settings.syncUrl || !settings.syncToken) return;
    const fresh = await pullPlan(settings.syncUrl, settings.syncToken);
    setState((prev) => ({
      ...prev,
      plan: applyPending({ ...prev.plan, ...fresh }, prev.pending),
      lastSync: new Date().toISOString(),
    }));
  }, []);

  const syncNow = useCallback(async () => {
    const { settings } = latest.current;
    if (!settings.syncUrl || !settings.syncToken) { setSyncState('off'); return; }
    if (busy.current) return;
    busy.current = true;
    setSyncState('syncing');
    try {
      const batch = latest.current.pending.slice();
      if (batch.length) {
        const results = await pushChanges(settings.syncUrl, settings.syncToken, batch);
        const failed = results.filter((r) => !r.ok);
        // Drop what was written. Keep anything the user edited again while the request was in flight.
        setState((prev) => ({
          ...prev,
          pending: prev.pending.filter((p) => !batch.some((b) => sameSlot(b, p) && sameValue(b, p))),
        }));
        if (failed.length) {
          notify(`${failed.length} change${failed.length > 1 ? 's' : ''} could not be saved because the sheet rows moved. Showing the sheet's version.`, 'warn');
        }
      }
      await doPull();
      setSyncError('');
      setSyncState('idle');
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : String(e));
      setSyncState('error');
    } finally {
      busy.current = false;
    }
  }, [doPull, notify]);

  // first load, URL/token changes
  useEffect(() => {
    if (!configured) { setSyncState('off'); return; }
    void syncNow();
  }, [configured, state.settings.syncUrl, state.settings.syncToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // push soon after an edit
  const pendingLen = state.pending.length;
  useEffect(() => {
    if (!configured || !pendingLen) return;
    const t = window.setTimeout(() => void syncNow(), 1200);
    return () => window.clearTimeout(t);
  }, [configured, pendingLen, state.pending, syncNow]);

  // keep fresh: poll while the tab is open, refresh when you come back to it, retry after an error
  useEffect(() => {
    if (!configured) return;
    const tick = () => { if (!document.hidden && !latest.current.pending.length) void syncNow(); };
    const interval = window.setInterval(tick, 45_000);
    const onVis = () => { if (!document.hidden) void syncNow(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    window.addEventListener('online', onVis);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
      window.removeEventListener('online', onVis);
    };
  }, [configured, syncNow]);

  useEffect(() => {
    if (syncState !== 'error') return;
    const t = window.setTimeout(() => void syncNow(), 15_000);
    return () => window.clearTimeout(t);
  }, [syncState, syncNow]);

  // ---- plan edits ----------------------------------------------------------
  const queue = useCallback((change: PendingChange) => {
    setState((prev) => {
      const rest = prev.pending.filter((p) => !sameSlot(p, change));
      const plan = applyPending(prev.plan, [change]);
      return { ...prev, plan, pending: [...rest, change] };
    });
  }, []);

  const setStep = useCallback<Store['setStep']>((subject, c, step, value) => {
    const steps = [...c.steps] as Steps;
    steps[step] = value ?? !steps[step];
    queue({ subject, row: c.row, topic: c.topic, part: c.part, field: 'steps', value: steps });
  }, [queue]);

  const setAllSteps = useCallback<Store['setAllSteps']>((subject, c, value) => {
    queue({ subject, row: c.row, topic: c.topic, part: c.part, field: 'steps', value: [value, value, value, value] });
  }, [queue]);

  const setClassNotes = useCallback<Store['setClassNotes']>((subject, c, text) => {
    queue({ subject, row: c.row, topic: c.topic, part: c.part, field: 'notes', value: text });
  }, [queue]);

  // ---- local-only data -----------------------------------------------------
  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setState((p) => ({ ...p, settings: { ...p.settings, ...patch } }));
  }, []);
  const addPaper = useCallback((paper: Omit<Paper, 'id'>) => setState((p) => ({ ...p, papers: [{ ...paper, id: uid() }, ...p.papers] })), []);
  const addMistake = useCallback<Store['addMistake']>((m) => setState((p) => ({ ...p, mistakes: [{ ...m, id: uid(), date: todayISO(), fixed: false, updatedAt: new Date().toISOString() }, ...p.mistakes] })), []);
  const updateMistake = useCallback<Store['updateMistake']>((id, patch) => setState((p) => ({ ...p, mistakes: p.mistakes.map((x) => (x.id === id ? { ...x, ...patch, updatedAt: new Date().toISOString() } : x)) })), []);
  const deleteMistake = useCallback((id: string) => setState((p) => ({ ...p, mistakes: p.mistakes.filter((x) => x.id !== id) })), []);
  const deletePaper = useCallback((id: string) => setState((p) => ({ ...p, papers: p.papers.filter((x) => x.id !== id) })), []);
  const saveNote = useCallback<Store['saveNote']>((n) => {
    const id = n.id ?? uid();
    const note: Note = { id, subject: n.subject, title: n.title, body: n.body, updatedAt: new Date().toISOString() };
    setState((p) => ({
      ...p,
      notes: p.notes.some((x) => x.id === id) ? p.notes.map((x) => (x.id === id ? note : x)) : [note, ...p.notes],
    }));
    return id;
  }, []);
  const deleteNote = useCallback((id: string) => setState((p) => ({ ...p, notes: p.notes.filter((x) => x.id !== id) })), []);
  const addFile = useCallback((f: Omit<FileLink, 'id'>) => setState((p) => ({ ...p, files: [...p.files, { ...f, id: uid() }] })), []);
  const deleteFile = useCallback((id: string) => setState((p) => ({ ...p, files: p.files.filter((x) => x.id !== id) })), []);

  const addCards = useCallback<Store['addCards']>((list) => {
    const today = todayISO();
    setState((p) => ({
      ...p,
      cards: [...p.cards, ...list.map((c) => ({ ...c, id: uid(), box: 0, due: today, reviews: 0 }))],
    }));
  }, []);
  const deleteCard = useCallback((id: string) => setState((p) => ({ ...p, cards: p.cards.filter((c) => c.id !== id) })), []);
  const reviewCard = useCallback<Store['reviewCard']>((id, grade) => {
    const gaps = [1, 3, 7, 14, 30];
    setState((p) => ({
      ...p,
      cards: p.cards.map((c) => {
        if (c.id !== id) return c;
        const box = grade === 'again' ? 0 : Math.min(4, c.box + (grade === 'easy' ? 2 : 1));
        return { ...c, box, reviews: c.reviews + 1, due: grade === 'again' ? todayISO() : addDays(todayISO(), gaps[box]) };
      }),
    }));
  }, []);
  const toggleMark = useCallback((key: string, path: string) => {
    setState((p) => {
      const cur = p.marks[key] ?? [];
      return { ...p, marks: { ...p.marks, [key]: cur.includes(path) ? cur.filter((x) => x !== path) : [...cur, path] } };
    });
  }, []);

  const setMark = useCallback((key: string, path: string, on: boolean) => {
    setState((p) => {
      const cur = p.marks[key] ?? [];
      if (cur.includes(path) === on) return p;
      return { ...p, marks: { ...p.marks, [key]: on ? [...cur, path] : cur.filter((x) => x !== path) } };
    });
  }, []);
  const assignFile = useCallback((subject: SubjectId, path: string, ref: TopicRef | null) => {
    setState((p) => {
      const mine = { ...(p.assign[subject] ?? {}) };
      if (ref) mine[path] = ref; else delete mine[path];
      return { ...p, assign: { ...p.assign, [subject]: mine } };
    });
  }, []);

  const exportBackup = useCallback(() => JSON.stringify(latest.current, null, 1), []);
  const importBackup = useCallback((raw: string) => {
    try {
      const p = JSON.parse(raw) as Persisted;
      if (p.v !== 2 || !p.plan) return false;
      setState({ ...initial(), ...p, settings: { ...defaultSettings, ...p.settings } });
      return true;
    } catch { return false; }
  }, []);
  const resetLocal = useCallback(() => setState(initial()), []);

  const value = useMemo<Store>(() => ({
    plan: state.plan, papers: state.papers, mistakes: state.mistakes, notes: state.notes, files: state.files, cards: state.cards, marks: state.marks, assign: state.assign, settings: state.settings,
    pendingCount: state.pending.length, syncState, syncError, lastSync: state.lastSync, toast,
    setStep, setAllSteps, setClassNotes, syncNow, updateSettings, addPaper, deletePaper, addMistake, updateMistake, deleteMistake, saveNote, deleteNote,
    addFile, deleteFile, addCards, deleteCard, reviewCard, toggleMark, setMark, assignFile, exportBackup, importBackup, resetLocal, notify,
  }), [state, syncState, syncError, toast, setStep, setAllSteps, setClassNotes, syncNow, updateSettings, addPaper, addMistake, updateMistake, deleteMistake,
    deletePaper, saveNote, deleteNote, addFile, deleteFile, addCards, deleteCard, reviewCard, toggleMark, setMark, assignFile, exportBackup, importBackup, resetLocal, notify]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore outside provider');
  return v;
}
