// Keeps flashcards, done-marks, notes, papers, links and topic moves the same on every device that opens Aster from your
// computer's library server. It does a three-way merge, so a card added on the tablet and a tick made on the PC both survive.
import { useSyncExternalStore } from 'react';
import { isServer } from './folders';
import type { AiKey } from './ai';
import { getAi, saveAi } from './ai';

export interface SharedData { cards: unknown[]; notes: unknown[]; papers: unknown[]; files: unknown[]; marks: Record<string, string[]>; assign: Record<string, unknown> }

type Json = unknown;
const same = (a: Json, b: Json) => JSON.stringify(a) === JSON.stringify(b);
const isObj = (v: Json): v is Record<string, Json> => !!v && typeof v === 'object' && !Array.isArray(v);
const hasId = (v: Json): v is { id: string } => isObj(v) && typeof v.id === 'string';

/** When both devices changed the same item, keep the one that has more history. */
function pickItem(l: Record<string, Json>, r: Record<string, Json>): Json {
  if (typeof l.reviews === 'number' && typeof r.reviews === 'number' && l.reviews !== r.reviews) return l.reviews > r.reviews ? l : r;
  if (typeof l.updatedAt === 'string' && typeof r.updatedAt === 'string' && l.updatedAt !== r.updatedAt) return l.updatedAt > r.updatedAt ? l : r;
  return l;
}

/** base = what both devices last agreed on; local = this device now; remote = the computer's copy now. */
export function merge3(base: Json, local: Json, remote: Json): Json {
  if (same(local, remote)) return local;
  if (same(base, local)) return remote;
  if (same(base, remote)) return local;
  if (Array.isArray(local) && Array.isArray(remote)) {
    const b = Array.isArray(base) ? base : [];
    if ([...local, ...remote].every(hasId)) {
      const idx = (a: Json[]) => new Map((a as Array<{ id: string }>).map((x) => [x.id, x]));
      const B = idx(b), L = idx(local), R = idx(remote);
      const out: Json[] = [];
      for (const id of new Set([...L.keys(), ...R.keys()])) {
        const l = L.get(id), r = R.get(id), o = B.get(id);
        if (l && r) { out.push(same(l, r) ? l : same(o, l) ? r : same(o, r) ? l : pickItem(l as never, r as never)); continue; }
        const only = (l ?? r)!;
        if (!o) { out.push(only); continue; }          // new on one device
        if (!same(o, only)) out.push(only);            // deleted on one, changed on the other: keep the change
        // deleted on one, untouched on the other: stays deleted
      }
      return out;
    }
    if ([...local, ...remote].every((x) => typeof x === 'string')) {
      const L = new Set(local as string[]), R = new Set(remote as string[]), B = new Set(b as string[]);
      const out = new Set<string>();
      for (const x of [...L, ...R]) { if (B.has(x) && (!L.has(x) || !R.has(x))) continue; out.add(x); }
      return [...out];
    }
    return local;
  }
  if (isObj(local) && isObj(remote)) {
    const b = isObj(base) ? base : {};
    const out: Record<string, Json> = {};
    for (const k of new Set([...Object.keys(local), ...Object.keys(remote)])) {
      const v = merge3(b[k], local[k], remote[k]);
      if (v !== undefined && !(Array.isArray(v) && v.length === 0 && !(k in local) && !(k in remote))) out[k] = v;
    }
    return out;
  }
  return local === undefined ? remote : local;
}

// ---- sync loop ----
export type SharedState = { status: 'off' | 'syncing' | 'ok' | 'error'; at: number | null; error: string };
let st: SharedState = { status: 'off', at: null, error: '' };
const subs = new Set<() => void>();
const set = (p: Partial<SharedState>) => { st = { ...st, ...p }; subs.forEach((f) => f()); };
export const useSharedStatus = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => st, () => st);

const META = 'aster.shared.v1';
interface Meta { v: number; base: SharedData | null }
const readMeta = (): Meta => { try { return { v: 0, base: null, ...(JSON.parse(localStorage.getItem(META) ?? '{}') as Partial<Meta>) }; } catch { return { v: 0, base: null }; } };
const writeMeta = (m: Meta) => { try { localStorage.setItem(META, JSON.stringify(m)); } catch { /* private mode */ } };

const EMPTY: SharedData = { cards: [], notes: [], papers: [], files: [], marks: {}, assign: {} };
const norm = (d: Partial<SharedData> | null | undefined): SharedData => ({ ...EMPTY, ...(d ?? {}) });

async function kv(ns: string, init?: RequestInit) {
  const r = await fetch(`/api/kv/${ns}`, init);
  if (r.status === 401) throw new Error('Sign in again with the PIN.');
  return r;
}

/** Runs one round. Returns the merged data when this device has to change. */
export async function syncOnce(get: () => SharedData, apply: (d: SharedData, was: SharedData) => void): Promise<void> {
  const meta = readMeta();
  for (let attempt = 0; attempt < 4; attempt++) {
    const local = norm(get());
    const rr = await kv('app');
    if (!rr.ok) throw new Error('The computer did not answer.');
    const remote = (await rr.json()) as { v: number; value: Partial<SharedData> | null };
    const base = norm(meta.base);
    const remoteData = norm(remote.value);
    const merged = merge3(base, local, remoteData) as SharedData;
    const needPush = !same(merged, remoteData);
    if (!same(merged, local)) apply(merged, local);
    if (!needPush) { writeMeta({ v: remote.v, base: merged }); return; }
    const put = await kv('app', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ base: remote.v, value: merged }) });
    if (put.status === 409) continue; // someone else saved in between: merge again
    if (!put.ok) throw new Error('Could not save to the computer.');
    const { v } = (await put.json()) as { v: number };
    writeMeta({ v, base: merged });
    return;
  }
  throw new Error('Could not settle changes between devices. Will retry.');
}

// ---- optional: share AI keys through the computer ----
const SHARE_KEY = 'aster.ai.share';
export const keysShared = () => { try { return localStorage.getItem(SHARE_KEY) === '1'; } catch { return false; } };
export function setKeysShared(on: boolean) { try { localStorage.setItem(SHARE_KEY, on ? '1' : '0'); } catch { /* ignore */ } }
export async function syncKeys(): Promise<void> {
  if (!keysShared()) return;
  const rr = await kv('aikeys');
  if (!rr.ok) return;
  const remote = (await rr.json()) as { v: number; value: { keys: AiKey[] } | null };
  const local = getAi().keys;
  const byId = new Map<string, AiKey>();
  for (const k of [...(remote.value?.keys ?? []), ...local]) byId.set(k.id, { ...byId.get(k.id), ...k });
  const merged = [...byId.values()];
  if (!same(merged, local)) saveAi({ keys: merged });
  if (!same(merged, remote.value?.keys ?? [])) {
    await kv('aikeys', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ base: remote.v, value: { keys: merged } }) });
  }
}

/** Starts the loop. Call poke() after local changes. Returns stop(). */
export function startShared(get: () => SharedData, apply: (d: SharedData, was: SharedData) => void): { poke: () => void; stop: () => void } {
  if (!isServer()) return { poke: () => undefined, stop: () => undefined };
  let timer = 0, running = false, again = false, dead = false;
  const run = async () => {
    if (running) { again = true; return; }
    running = true; set({ status: 'syncing' });
    try { await syncOnce(get, apply); await syncKeys().catch(() => undefined); if (!dead) set({ status: 'ok', at: Date.now(), error: '' }); }
    catch (e) { if (!dead) set({ status: 'error', error: e instanceof Error ? e.message : 'Sync failed.' }); }
    finally { running = false; if (again && !dead) { again = false; void run(); } }
  };
  const poke = () => { window.clearTimeout(timer); timer = window.setTimeout(() => void run(), 1500); };
  const iv = window.setInterval(() => void run(), 20_000);
  const vis = () => { if (document.visibilityState === 'visible') void run(); };
  document.addEventListener('visibilitychange', vis);
  void run();
  return { poke, stop: () => { dead = true; window.clearTimeout(timer); window.clearInterval(iv); document.removeEventListener('visibilitychange', vis); } };
}
