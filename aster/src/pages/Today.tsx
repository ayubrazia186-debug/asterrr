import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useStore } from '../state/store';
import { SUBJECTS } from '../data/subjects';
import { ClassRow } from '../components/ClassRow';
import { DayStrip } from '../components/DayStrip';
import { Bar, Empty } from '../components/ui';
import { behindOf, dayCells, isDone, pace, planClasses, planSpan, progressOf, todayOf } from '../lib/plan';
import { daysBetween, dayMonth, greeting, longDate, todayISO } from '../lib/dates';

export function Today() {
  const { plan, settings, syncState } = useStore();
  const today = todayISO();
  const cells = dayCells(plan);
  const span = planSpan(plan);
  const dayNo = span ? daysBetween(span.start, today) + 1 : 0;
  const total = cells.length;
  const inPlan = span ? today >= span.start && today <= span.end : false;

  const all = SUBJECTS.flatMap((s) => planClasses(plan[s.id]).map((c) => ({ s, c })));
  const todays = SUBJECTS.map((s) => ({ s, list: todayOf(planClasses(plan[s.id])) })).filter((g) => g.list.length);
  const todayCount = todays.reduce((n, g) => n + g.list.length, 0);
  const todayDone = todays.reduce((n, g) => n + g.list.filter(isDone).length, 0);
  const behind = SUBJECTS.map((s) => ({ s, list: behindOf(planClasses(plan[s.id])) })).filter((g) => g.list.length);
  const behindCount = behind.reduce((n, g) => n + g.list.length, 0);
  const end = span?.end ?? today;
  const remainingAll = all.filter((x) => !isDone(x.c)).length;
  const daysLeft = Math.max(0, daysBetween(today, end));

  const upcoming = all.filter((x) => x.c.date && x.c.date > today).map((x) => x.c.date!).sort()[0];

  const headline = !span
    ? 'Your plan will show here once the sheets load.'
    : today < span.start
      ? `The plan starts on ${longDate(span.start)}.`
      : today > span.end
        ? 'The 45-day plan has finished.'
        : `Day ${dayNo} of ${total}. ${daysLeft === 0 ? 'Last day of the plan.' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left after today.`}`;

  return (
    <div className="page">
      <header className="pagehead">
        <div>
          <h1>{greeting()}{settings.name ? `, ${settings.name}` : ''}</h1>
          <p className="lede">{longDate(today)}. {headline}</p>
        </div>
      </header>

      {syncState === 'off' && (
        <div className="notice">
          <div>
            <strong>Your sheets are not connected yet.</strong>{' '}
            {all.length
              ? 'You are looking at a snapshot of them. Ticks you make here are saved on this device and will be sent to the sheets once you connect.'
              : 'Connect them to load your 45-day plan.'}
          </div>
          <Link to="/settings" className="btn btn--sm">Connect sheets</Link>
        </div>
      )}

      <section className="panel panel--strip" aria-labelledby="strip-h">
        <div className="panel__head">
          <h2 id="strip-h">The 45 days</h2>
          <span className="muted">{remainingAll} classes still to finish across all subjects</span>
        </div>
        <DayStrip cells={cells} />
        <p className="legend">
          <span><i className="lg lg--fill" /> ticks done</span>
          <span><i className="lg lg--missed" /> past day with unfinished classes</span>
          <span><i className="lg lg--now" /> today</span>
        </p>
      </section>

      <div className="cols">
        <div className="cols__main">
          <section aria-labelledby="today-h">
            <div className="sechead">
              <h2 id="today-h">Today&rsquo;s classes</h2>
              {todayCount > 0 && <span className="muted">{todayDone} of {todayCount} done</span>}
            </div>
            {todays.length === 0 ? (
              <Empty title={inPlan ? 'No classes are scheduled for today.' : 'Nothing scheduled today.'}>
                {upcoming ? `Your next class is on ${longDate(upcoming)}.` : 'Use the time to catch up on anything marked behind.'}
              </Empty>
            ) : todays.map(({ s, list }) => (
              <div className="group" key={s.id} style={{ ['--accent' as string]: s.color }}>
                <Link to={`/s/${s.id}/planner`} className="group__head"><span className="dot" />{s.name}<ArrowRight size={14} /></Link>
                {list.map((c) => <ClassRow key={c.row} subject={s.id} item={c} />)}
              </div>
            ))}
          </section>

          <section aria-labelledby="behind-h">
            <div className="sechead">
              <h2 id="behind-h">Catch up</h2>
              {behindCount > 0 && <span className="muted">{behindCount} classes before today are not finished</span>}
            </div>
            {behind.length === 0 ? (
              <Empty title="You are on schedule.">Every class dated before today has all four steps ticked.</Empty>
            ) : (
              <div className="catch">
                {behind.map(({ s, list }) => {
                  const oldest = list.map((c) => c.date!).sort()[0];
                  return (
                    <Link key={s.id} to={`/s/${s.id}/planner?show=todo`} className="catch__row" style={{ ['--accent' as string]: s.color }}>
                      <span className="dot" />
                      <span className="catch__name">{s.name}</span>
                      <span className="catch__n">{list.length} behind</span>
                      <span className="muted catch__old">since {dayMonth(oldest)}</span>
                      <ArrowRight size={15} />
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <aside className="cols__side" aria-label="Progress">
          <section className="panel">
            <h2 className="panel__title">Progress by subject</h2>
            <ul className="plist">
              {SUBJECTS.map((s) => {
                const list = planClasses(plan[s.id]);
                const p = progressOf(list);
                const pc = pace(list, end);
                return (
                  <li key={s.id}>
                    <Link to={`/s/${s.id}/planner`} className="plist__row" style={{ ['--accent' as string]: s.color }}>
                      <span className="plist__top"><strong>{s.name}</strong><span className="num">{p.total ? `${Math.round(p.ratio * 100)}%` : 'No sheet'}</span></span>
                      <Bar value={p.ratio} color={s.color} />
                      <span className="muted plist__sub">
                        {p.total ? `${p.done} of ${p.total} classes done${pc.perDay ? `. ${pc.perDay}/day to finish` : ''}` : 'Add a sheet in settings'}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
