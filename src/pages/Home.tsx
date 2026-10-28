import { Link } from 'react-router-dom';
import { ArrowUpRight, BookOpen, Briefcase, Cpu, Sigma, ReceiptText, type LucideIcon } from 'lucide-react';
import { useStore } from '../state/store';
import { SUBJECTS } from '../data/subjects';
import type { SubjectId } from '../types';
import { DayStrip } from '../components/DayStrip';
import { behindOf, dayCells, planClasses, planSpan, progressOf, todayOf } from '../lib/plan';
import { daysBetween, greeting, longDate, todayISO } from '../lib/dates';
import { useCountUp } from '../lib/useCountUp';
import { useLast } from '../lib/last';
import { subjectMeta } from '../data/subjects';
import { PlayCircle, Layers3 } from 'lucide-react';
import { TodayCard } from '../components/TodayCard';

const ICON: Record<SubjectId, LucideIcon> = { maths: Sigma, accounting: ReceiptText, cs: Cpu, business: Briefcase, english: BookOpen };
const R = 27;
const C = 2 * Math.PI * R;

function Ring({ pct, index }: { pct: number; index: number }) {
  const shown = useCountUp(pct, 1100, 250 + index * 80);
  return (
    <span className="ring" role="img" aria-label={`${pct} percent of steps ticked`}>
      <svg viewBox="0 0 64 64" width="68" height="68" aria-hidden="true">
        <circle cx="32" cy="32" r={R} className="ring__track" />
        <circle cx="32" cy="32" r={R} className="ring__arc" style={{ ['--c' as string]: C, strokeDasharray: C, strokeDashoffset: C * (1 - pct / 100), animationDelay: `${250 + index * 80}ms` }} />
      </svg>
      <span className="ring__num num">{shown}%</span>
    </span>
  );
}

export function Home() {
  const { plan, settings, cards } = useStore();
  const last = useLast();
  const dueCards = cards.filter((c) => c.due <= todayISO()).length;
  const today = todayISO();
  const span = planSpan(plan);
  const cells = dayCells(plan);
  const inPlan = !!span && today >= span.start && today <= span.end;
  const dayNo = span ? daysBetween(span.start, today) + 1 : 0;
  const totals = SUBJECTS.reduce((a, s) => {
    const l = planClasses(plan[s.id]);
    return { today: a.today + todayOf(l).length, behind: a.behind + behindOf(l).length };
  }, { today: 0, behind: 0 });

  return (
    <div className="page page--home">
      <header className="pagehead">
        <div>
          <h1>{greeting()}{settings.name ? `, ${settings.name}` : ''}</h1>
          <p className="lede">
            {longDate(today)}.{' '}
            {inPlan ? `Day ${dayNo} of ${cells.length}. ${totals.today} class${totals.today === 1 ? '' : 'es'} today, ${totals.behind} to catch up on.` : 'Pick a subject to get started.'}
          </p>
        </div>
        <Link to="/today" className="btn btn--ghost">Open today&rsquo;s list</Link>
      </header>

      <TodayCard />

      {cells.length > 0 && <div className="homestrip"><DayStrip cells={cells} /></div>}

      {(last || dueCards > 0) && (
        <div className="homeacts">
          {last && (
            <Link className="homeact" to={`/s/${last.subject}/${last.section}?topic=${encodeURIComponent(last.topicKey)}`}>
              <PlayCircle size={22} />
              <span><strong>Continue studying</strong><span className="muted">{subjectMeta(last.subject).name}: {last.title}</span></span>
            </Link>
          )}
          {dueCards > 0 && (
            <Link className="homeact" to={`/s/${(cards.find((c) => c.due <= todayISO()) ?? cards[0]).subject}/flashcards`}>
              <Layers3 size={22} />
              <span><strong>{dueCards} flashcard{dueCards === 1 ? '' : 's'} due</strong><span className="muted">A few minutes keeps them fresh</span></span>
            </Link>
          )}
        </div>
      )}

      <h2 className="sr">Your subjects</h2>
      <div className="books">
        {SUBJECTS.map((s, i) => {
          const sp = plan[s.id];
          const list = planClasses(sp);
          const p = progressOf(list);
          const behind = behindOf(list).length;
          const todayN = todayOf(list).length;
          const Icon = ICON[s.id];
          return (
            <Link key={s.id} to={`/s/${s.id}/planner`} className={`book book--${s.id}`} style={{ ['--accent' as string]: s.color, ['--tint' as string]: s.tint, ['--i' as string]: i }}>
              <span className="book__spine" aria-hidden="true" />
              <Icon className="book__mark" size={150} strokeWidth={1.1} aria-hidden="true" />
              <span className="book__label">
                <span className="book__code">{s.code}</span>
                <span className="book__name">{s.name}</span>
                <span className="book__teacher">{sp?.teacher || 'Sheet not added yet'}</span>
              </span>
              <span className="book__foot">
                {p.total > 0 ? <Ring pct={Math.round(p.ratio * 100)} index={i} /> : <span className="ring ring--empty" aria-hidden="true" />}
                <span className="book__chips">
                  {p.total > 0 ? (
                    <>
                      <span className="chip">{todayN} today</span>
                      <span className={behind ? 'chip chip--warn' : 'chip'}>{behind ? `${behind} behind` : 'On schedule'}</span>
                    </>
                  ) : <span className="chip">Notes, papers, flashcards</span>}
                </span>
              </span>
              <span className="book__go" aria-hidden="true"><ArrowUpRight size={20} /></span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
