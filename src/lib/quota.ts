// Focus Lock's class rule. If you are behind, the work is the late classes: all of them, and today's wait until you are
// caught up. If you are not behind, the work is today's classes.
export interface Base { day: string; remaining: number }

/** Keeps the highest number of late classes seen today (ticking only lowers it, a late-loading sheet can raise it). */
export function nextBase(prev: Base | null, day: string, lateNow: number): Base {
  if (!prev || prev.day !== day) return { day, remaining: lateNow };
  return lateNow > prev.remaining ? { day, remaining: lateNow } : prev;
}

/** [finished, owed]. Late classes first; when none were late today, today's classes. */
export function quota(base: Base | null, day: string, lateNow: number, todayDone: number, todayTotal: number): { done: number; owed: number; kind: 'late' | 'today' } {
  const start = base && base.day === day ? Math.max(base.remaining, lateNow) : lateNow;
  if (start > 0) return { done: Math.max(0, start - lateNow), owed: start, kind: 'late' };
  return { done: todayDone, owed: todayTotal, kind: 'today' };
}
