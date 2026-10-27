// The linked folder of every subject, loaded once and shared, so the planner, home page and notes all see the same files.
import { useEffect, useSyncExternalStore } from 'react';
import type { SubjectId } from '../types';
import { SUBJECTS } from '../data/subjects';
import { accessState, courseKey, loadLink, type Access, type LinkedTree } from './folders';

export interface Library {
  trees: Partial<Record<SubjectId, LinkedTree>>;
  access: Partial<Record<SubjectId, Access>>;
  ready: boolean;
}

let state: Library = { trees: {}, access: {}, ready: false };
let started = false;
const subs = new Set<() => void>();

export async function reloadLibrary() {
  const trees: Library['trees'] = {};
  const access: Library['access'] = {};
  await Promise.all(SUBJECTS.map(async (s) => {
    try {
      const t = await loadLink(courseKey(s.id));
      if (t) trees[s.id] = t;
      access[s.id] = await accessState(courseKey(s.id));
    } catch { access[s.id] = 'missing'; }
  }));
  state = { trees, access, ready: true };
  subs.forEach((f) => f());
}

export function useLibrary(): Library {
  useEffect(() => { if (!started) { started = true; void reloadLibrary(); } }, []);
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state, () => state);
}
