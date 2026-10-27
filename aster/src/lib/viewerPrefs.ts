// Reading and watching preferences, remembered on this device only.
import { useSyncExternalStore } from 'react';

export type PdfTheme = 'auto' | 'light' | 'night' | 'sepia';
/** The theme actually drawn: 'auto' follows the app (dark app, night pages). */
export const effectivePdfTheme = (t: PdfTheme): 'light' | 'night' | 'sepia' => {
  if (t !== 'auto') return t;
  const forced = document.documentElement.getAttribute('data-theme');
  const dark = forced ? forced === 'dark' : window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  return dark ? 'night' : 'light';
};
export interface ViewerPrefs {
  builtin: boolean; pdfTheme: PdfTheme; pdfBright: number; pdfZoom: number;
  vBoost: number; voice: boolean; vFit: 'contain' | 'cover'; vBright: number; theater: boolean;
}
const KEY = 'aster.viewer.v1';
const DEFAULTS: ViewerPrefs = { builtin: true, pdfTheme: 'auto', pdfBright: 1, pdfZoom: 1, vBoost: 1, voice: false, vFit: 'contain', vBright: 1, theater: false };

function load(): ViewerPrefs {
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<ViewerPrefs>) }; } catch { return DEFAULTS; }
}
let state = load();
const subs = new Set<() => void>();

export function setViewerPrefs(patch: Partial<ViewerPrefs>) {
  state = { ...state, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode */ }
  subs.forEach((f) => f());
}
export const useViewerPrefs = (): ViewerPrefs => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state, () => state);

// ---- video bookmarks ----
export interface Bookmark { t: number; label: string }
const BK = 'aster.bookmarks.v1';
const readAll = (): Record<string, Bookmark[]> => { try { return JSON.parse(localStorage.getItem(BK) ?? '{}') as Record<string, Bookmark[]>; } catch { return {}; } };
export const getBookmarks = (id: string): Bookmark[] => readAll()[id] ?? [];
export function saveBookmarks(id: string, list: Bookmark[]) {
  try { const all = readAll(); if (list.length) all[id] = list; else delete all[id]; localStorage.setItem(BK, JSON.stringify(all)); } catch { /* ignore */ }
}
