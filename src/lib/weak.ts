import type { Card, Mistake, Paper, SubjectId } from '../types';

export interface Weak { subject: SubjectId; topic: string; why: string; score: number }

/**
 * Ranks what to revise first, from three things you have recorded yourself:
 * mistakes not yet fixed (2 points each), flashcards still in the first box (0.5 each),
 * and papers scored under 60% (3 points, no topic, so it shows as the paper).
 * Nothing is guessed: no records, no list.
 */
export function weakTopics(mistakes: Mistake[], cards: Card[], papers: Paper[], limit = 5): Weak[] {
  const map = new Map<string, Weak & { m: number; c: number }>();
  const bump = (subject: SubjectId, topic: string, pts: number, kind: 'm' | 'c') => {
    const t = topic.trim() || 'General';
    const key = `${subject}|${t.toLowerCase()}`;
    const cur = map.get(key) ?? { subject, topic: t, why: '', score: 0, m: 0, c: 0 };
    cur.score += pts; cur[kind] += 1; map.set(key, cur);
  };
  for (const m of mistakes) if (!m.fixed && m.kind === 'mistake') bump(m.subject, m.topic, 2, 'm');
  for (const c of cards) if (c.box === 0) bump(c.subject, c.deck, 0.5, 'c');
  const out: Weak[] = [...map.values()].map((x) => ({
    subject: x.subject, topic: x.topic, score: x.score,
    why: [x.m ? `${x.m} mistake${x.m === 1 ? '' : 's'} to fix` : '', x.c ? `${x.c} new card${x.c === 1 ? '' : 's'}` : ''].filter(Boolean).join(', '),
  }));
  for (const p of papers) {
    if (p.score != null && p.total > 0 && p.score / p.total < 0.6) {
      out.push({ subject: p.subject, topic: `${p.year} ${p.session} paper ${p.paper}`, score: 3, why: `scored ${Math.round(((p.score ?? 0) / p.total) * 100)}%, go through it again` });
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
