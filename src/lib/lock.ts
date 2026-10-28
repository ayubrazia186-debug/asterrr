// Focus Lock: in the Aster desktop app, the PC stays locked to Aster after it starts until today's work is done.
// The desktop shell (desktop/main.cjs) owns the real lock; this file holds the rules and the state the screens show.
import { useEffect, useSyncExternalStore } from 'react';
import { todayISO } from './dates';
import { nextBase, type Base } from './quota';

export interface LockCfg {
  enabled: boolean;
  /** minutes of study with a PDF or video open in Aster */
  minutes: number;
  needTasks: boolean;
  needProof: boolean;
  /** photos of handwritten work the AI must see */
  photos: number;
  /** also switch Task Manager off while locked (Windows) */
  blockTaskMgr: boolean;
}
export interface LockState {
  cfg: LockCfg;
  /** looser settings wait here for 24 hours before they apply */
  pending: { cfg: LockCfg; at: number } | null;
  unlockedDay: string | null;
  /** milliseconds studied per day */
  study: Record<string, number>;
  proofDay: string | null;
  /** the most unfinished (late + today's) classes seen today: the starting point for today's quota */
  dayBase: Base | null;
  /** fingerprints of photos already accepted, so old pictures cannot be used again */
  usedHashes: string[];
  emergency: { startedAt: number | null; lastUsed: number | null };
}
export interface LockInit { state: LockState; sessionLocked: boolean; desktop: boolean; emergencyWaitMs: number; tmFailed?: boolean }

export const DEFAULT_CFG: LockCfg = { enabled: false, minutes: 120, needTasks: true, needProof: true, photos: 2, blockTaskMgr: true };
export const EMPTY_STATE: LockState = {
  cfg: DEFAULT_CFG, pending: null, unlockedDay: null, study: {}, proofDay: null, dayBase: null, usedHashes: [], emergency: { startedAt: null, lastUsed: null },
};
export const COOLDOWN_MS = 24 * 3600_000;
export const EMERGENCY_GAP_MS = 7 * 24 * 3600_000;
export const EMERGENCY_PHRASE = 'I am choosing to skip my revision today and I will make it up tomorrow.';

interface Bridge {
  load(): Promise<LockInit>;
  save(s: LockState): Promise<void>;
  unlock(reason: 'done' | 'emergency'): Promise<boolean>;
  dialog(): void;
}
const bridge = (): Bridge | null => (typeof window !== 'undefined' ? (window as unknown as { asterDesktop?: { lock: Bridge } }).asterDesktop?.lock ?? null : null);
export const isDesktop = () => !!bridge();

// ---- store ----
let state: LockState = EMPTY_STATE;
let locked = false;
let ready = false;
let waitMs = 30 * 60_000;
let tmFailed = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
let version = 0;
const snapshot = () => version;

export async function initLock(): Promise<void> {
  const b = bridge();
  if (b) {
    try {
      const i = await b.load();
      state = normalize(i.state);
      locked = i.sessionLocked;
      waitMs = i.emergencyWaitMs;
      tmFailed = !!i.tmFailed;
    } catch { /* stays unlocked: nothing to enforce */ }
  }
  ready = true; version++; emit();
}

function normalize(s: Partial<LockState> | undefined): LockState {
  const o = s ?? {};
  return {
    ...EMPTY_STATE, ...o,
    cfg: { ...DEFAULT_CFG, ...(o.cfg ?? {}) },
    study: o.study ?? {}, usedHashes: o.usedHashes ?? [], dayBase: o.dayBase ?? null,
    emergency: { startedAt: null, lastUsed: null, ...(o.emergency ?? {}) },
  };
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function persist(now = false) {
  version++; emit();
  const b = bridge();
  if (!b) return;
  if (saveTimer) clearTimeout(saveTimer);
  const go = () => { saveTimer = null; void b.save(state).catch(() => {}); };
  if (now) go(); else saveTimer = setTimeout(go, 3000);
}

export function useLock() {
  useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, snapshot, snapshot);
  return { ready, state, locked, waitMs, tmFailed, desktop: isDesktop() };
}
export const getLockState = () => state;

// ---- rules ----
const stricter = (a: LockCfg, b: LockCfg): LockCfg => ({
  enabled: a.enabled || b.enabled, minutes: Math.max(a.minutes, b.minutes), needTasks: a.needTasks || b.needTasks,
  needProof: a.needProof || b.needProof, photos: Math.max(a.photos, b.photos), blockTaskMgr: a.blockTaskMgr || b.blockTaskMgr,
});
const looser = (cur: LockCfg, next: LockCfg) =>
  (cur.enabled && !next.enabled) || next.minutes < cur.minutes || next.photos < cur.photos || (cur.needTasks && !next.needTasks) || (cur.needProof && !next.needProof) || (cur.blockTaskMgr && !next.blockTaskMgr);

/** Stricter settings apply now. Anything looser (including turning the lock off) waits 24 hours. Not allowed while locked. */
export function requestCfg(next: LockCfg): 'applied' | 'waiting' | 'blocked' {
  if (locked) return 'blocked';
  const cur = state.cfg;
  if (!cur.enabled) { state = { ...state, cfg: next, pending: null }; persist(true); return 'applied'; }
  if (looser(cur, next)) {
    state = { ...state, cfg: stricter(cur, next), pending: { cfg: next, at: Date.now() + COOLDOWN_MS } };
    persist(true); return 'waiting';
  }
  state = { ...state, cfg: next, pending: null }; persist(true); return 'applied';
}
export function cancelPending() { if (!locked && state.pending) { state = { ...state, pending: null }; persist(true); } }

// ---- study time ----
export const studiedMinutes = (s: LockState, day = todayISO()) => (s.study[day] ?? 0) / 60_000;
export function addStudy(ms: number) {
  const d = todayISO();
  state = { ...state, study: { ...state.study, [d]: (state.study[d] ?? 0) + ms } };
  persist();
}
/** Counts seconds while Aster is in front and you are using it (a mouse move, key or touch in the last 5 minutes). */
export function useStudyClock(active = true) {
  useEffect(() => {
    if (!active) return;
    let last = Date.now();
    const poke = () => { last = Date.now(); };
    const evs = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    evs.forEach((e) => window.addEventListener(e, poke, { passive: true }));
    let pending = 0;
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible' || !document.hasFocus() || Date.now() - last > 300_000) return;
      pending += 1000;
      if (pending >= 10_000) { addStudy(pending); pending = 0; }
    }, 1000);
    return () => { clearInterval(id); evs.forEach((e) => window.removeEventListener(e, poke)); if (pending) addStudy(pending); };
  }, [active]);
}

// ---- class quota ----
export function noteRemaining(remaining: number) {
  const day = todayISO();
  const nb = nextBase(state.dayBase, day, remaining);
  if (nb === state.dayBase || (state.dayBase && nb.day === state.dayBase.day && nb.remaining === state.dayBase.remaining)) return;
  state = { ...state, dayBase: nb };
  persist();
}

// ---- proof ----
export const proofOk = (s: LockState, day = todayISO()) => s.proofDay === day;
export function markProof(hashes: string[]) {
  state = { ...state, proofDay: todayISO(), usedHashes: [...state.usedHashes, ...hashes].slice(-600) };
  persist(true);
}

// ---- unlocking ----
export interface Need { tasks: [number, number] | null; study: [number, number] | null; proof: boolean | null }
export function needs(s: LockState, tasksDone: number, tasksTotal: number): Need {
  const c = s.cfg;
  return {
    tasks: c.needTasks ? [tasksDone, tasksTotal] : null,
    study: c.minutes > 0 ? [Math.min(c.minutes, Math.floor(studiedMinutes(s))), c.minutes] : null,
    proof: c.needProof ? proofOk(s) : null,
  };
}
export const allMet = (n: Need) =>
  (!n.tasks || n.tasks[0] >= n.tasks[1]) && (!n.study || n.study[0] >= n.study[1]) && (n.proof === null || n.proof);

export async function unlock(reason: 'done' | 'emergency'): Promise<boolean> {
  const b = bridge();
  if (!b) return false;
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; await b.save(state).catch(() => {}); }
  const ok = await b.unlock(reason).catch(() => false);
  if (ok) {
    locked = false;
    state = { ...state, unlockedDay: todayISO() };
    if (reason === 'emergency') state = { ...state, emergency: { startedAt: null, lastUsed: Date.now() } };
    version++; emit();
  }
  return ok;
}

// ---- emergency exit ----
export const emergencyLeft = (s: LockState) => (s.emergency.lastUsed ? Math.max(0, s.emergency.lastUsed + EMERGENCY_GAP_MS - Date.now()) : 0);
export function startEmergency() {
  if (emergencyLeft(state) > 0) return;
  state = { ...state, emergency: { ...state.emergency, startedAt: Date.now() } };
  persist(true);
}
export function cancelEmergency() { state = { ...state, emergency: { ...state.emergency, startedAt: null } }; persist(true); }
export const dialogOpening = () => bridge()?.dialog();
