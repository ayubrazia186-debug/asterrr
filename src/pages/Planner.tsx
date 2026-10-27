import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../state/store';
import { SUBJECTS } from '../data/subjects';
import { ClassRow } from '../components/ClassRow';
import { Empty } from '../components/ui';
import { dayCells, isDone, planClasses, planSpan, ticksOf } from '../lib/plan';
import { cx, daysBetween, dayMonth, longDate, todayISO, weekday } from '../lib/dates';

export function Planner() {
  const { plan } = useStore();
  const today = todayISO();
  const cells = dayCells(plan);
  const span = planSpan(plan);
  const [sel, setSel] = useState(span && today >= span.start && today <= span.end ? today : span?.start ?? today);
  const scroller = useRef<HTMLDivElement>(null);

  // keep the chosen day in view inside the wide grid (matters most on a phone)
  useEffect(() => {
    const box = scroller.current;
    const th = box?.querySelector<HTMLElement>('.heat__day.is-sel');
    if (box && th) box.scrollTo({ left: Math.max(0, th.offsetLeft - box.clientWidth / 2 + 12), behavior: 'auto' });
  }, [sel]);

  if (!span) return <div className="page"><header className="pagehead"><h1>Planner</h1></header><Empty title="No plan loaded.">Connect your sheets in settings to see the 45 days here.</Empty></div>;

  const dayNo = daysBetween(span.start, sel) + 1;
  const groups = SUBJECTS.map((s) => ({ s, list: planClasses(plan[s.id]).filter((c) => c.date === sel) })).filter((g) => g.list.length);
  const doneN = groups.reduce((n, g) => n + g.list.filter(isDone).length, 0);
  const totalN = groups.reduce((n, g) => n + g.list.length, 0);

  return (
    <div className="page">
      <header className="pagehead">
        <div>
          <h1>Planner</h1>
          <p className="lede">Every class of the 45 days across your subjects. Pick a day to see and tick its classes.</p>
        </div>
      </header>

      <section className="panel">
        <div className="gridscroll" ref={scroller}>
          <table className="heat" aria-label="Classes per subject per day">
            <thead>
              <tr>
                <th className="heat__corner" scope="col"><span className="sr">Subject</span></th>
                {cells.map((c) => (
                  <th key={c.date} scope="col" className={cx('heat__day', c.date === today && 'is-today', c.date === sel && 'is-sel')}>
                    <button type="button" onClick={() => setSel(c.date)} aria-label={`Day ${c.dayNo}, ${longDate(c.date)}`}>
                      <span className="heat__wd">{weekday(c.date).slice(0, 1)}</span>
                      <span className="heat__dn">{Number(c.date.slice(8))}</span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SUBJECTS.map((s) => {
                const list = planClasses(plan[s.id]);
                return (
                  <tr key={s.id} style={{ ['--accent' as string]: s.color, ['--tint' as string]: s.tint }}>
                    <th scope="row" className="heat__subj"><Link to={`/s/${s.id}/planner`}><span className="dot" />{s.name}</Link></th>
                    {cells.map((c) => {
                      const day = list.filter((x) => x.date === c.date);
                      if (!day.length) return <td key={c.date} className={cx('heat__cell is-none', c.date === sel && 'is-sel')} onClick={() => setSel(c.date)} />;
                      const ratio = day.reduce((n, x) => n + ticksOf(x), 0) / (day.length * 4);
                      const late = c.date < today && ratio < 1;
                      return (
                        <td key={c.date} className={cx('heat__cell', ratio === 1 && 'is-full', late && 'is-late', c.date === sel && 'is-sel')} onClick={() => setSel(c.date)}
                          title={`${s.name}, ${longDate(c.date)}: ${day.filter(isDone).length} of ${day.length} done`}>
                          <span className="heat__fill" style={{ height: `${ratio * 100}%` }} />
                          <span className="heat__n">{day.length}</span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="legend">
          <span><i className="lg lg--fill" /> ticks done</span>
          <span><i className="lg lg--missed" /> past and unfinished</span>
          <span>Number in a cell is how many classes that day</span>
        </p>
      </section>

      <div className="sechead">
        <h2>Day {dayNo}, {longDate(sel)}{sel === today ? ' (today)' : ''}</h2>
        {totalN > 0 && <span className="muted">{doneN} of {totalN} done</span>}
      </div>
      <div className="mt">
        {groups.length === 0 ? (
          <Empty title="No classes on this day.">{sel < today ? 'It is in the past.' : `Nothing is scheduled for ${dayMonth(sel)}.`}</Empty>
        ) : groups.map(({ s, list }) => (
          <div key={s.id} className="group" style={{ ['--accent' as string]: s.color }}>
            <Link to={`/s/${s.id}/planner`} className="group__head"><span className="dot" />{s.name}</Link>
            {list.map((c) => <ClassRow key={c.row} subject={s.id} item={c} />)}
          </div>
        ))}
      </div>
    </div>
  );
}
