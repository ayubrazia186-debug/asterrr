// The last topic you studied, so Home can offer "Continue".
import { useSyncExternalStore } from 'react';
import type { SubjectId } from '../types';

export interface Last { subject: SubjectId; section: 'notes' | 'topicals'; topicKey: string; title: string; at: number }
const KEY = 'aster.last.v1';
const read = (): Last | null => { try { return JSON.parse(localStorage.getItem(KEY) ?? 'null') as Last | null; } catch { return null; } };
let state = read();
const subs = new Set<() => void>();
export function setLast(l: Omit<Last, 'at'>) {
  state = { ...l, at: Date.now() };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode */ }
  subs.forEach((f) => f());
}
export const useLast = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state, () => state);
