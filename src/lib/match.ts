// Connects a planner class to the notes topic that covers it, by topic number and shared words.
import type { FNode, SubjectId } from '../types';
import { organize, type Organized, type Topic } from './organize';

const STOP = new Set(['the', 'and', 'for', 'with', 'of', 'to', 'in', 'on', 'a', 'an', 'part', 'class', 'lesson', 'section', 'topic', 'chapter', 'revision', 'paper', 'lecture']);
const words = (s: string) => (s.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter((w) => !STOP.has(w)).map((w) => w.replace(/(ing|es|s)$/, ''));
const numbers = (s: string): string[] => s.match(/\d+(?:\.\d+)?/g) ?? [];

export function bestTopic(text: string, topics: Topic[]): Topic | null {
  const tw = new Set(words(text));
  if (!tw.size && !numbers(text).length) return null;
  const nums = numbers(text);
  let best: Topic | null = null;
  let bestScore = 0;
  for (const t of topics) {
    const w = words(t.title);
    if (!w.length) continue;
    const hit = w.filter((x) => tw.has(x)).length;
    const cover = hit / Math.min(w.length, Math.max(tw.size, 1));
    const numHit = t.num && nums.includes(t.num as string) ? 1 : 0;
    const score = cover + numHit * 0.6;
    if (score > bestScore && (cover >= 0.5 || (numHit && hit >= 1))) { best = t; bestScore = score; }
  }
  return best;
}

const cache = new WeakMap<FNode, Organized>();
export function organizedFor(root: FNode, assign: Record<string, unknown> | undefined): Organized {
  // the cache is only valid while nothing was moved by hand
  if (!assign || !Object.keys(assign).length) {
    const c = cache.get(root);
    if (c) return c;
    const o = organize(root, {});
    cache.set(root, o);
    return o;
  }
  return organize(root, assign as never);
}
export type { SubjectId };
