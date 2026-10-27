import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { subjectMeta } from '../data/subjects';
import { ClassRow } from './ClassRow';
import { Bar, Empty, Segmented } from './ui';
import { isDone, pace, planClasses, laterClasses, planSpan, topicGroups } from '../lib/plan';
import { daysBetween, longDate, todayISO } from '../lib/dates';
import type { ClassItem } from '../types';

export type Show = 'todo' | 'today' | 'all' | 'done' | 'later';

export function PlanTab({ id, planList, laterList, initial, perDay, daysLeft, end }: {
  id: ReturnType<typeof subjectMeta>['id']; planList: ClassItem[]; laterList: ClassItem[]; initial?: Show; perDay: number; daysLeft: number; end: string;
}) {
  const today = todayISO();
  const todo = planList.filter((c) => !isDone(c) && !!c.date && c.date <= today);
  const [show, setShow] = useState<Show>(initial ?? (todo.length ? 'todo' : 'today'));
  const todays = planList.filter((c) => c.date === today);

  const list: ClassItem[] =
    show === 'todo' ? todo : show === 'today' ? todays : show === 'done' ? planList.filter(isDone) : show === 'later' ? laterList : planList;

  const byDay = useMemo(() => {
    const m = new Map<number | string, ClassItem[]>();
    list.forEach((c) => { const k = show === 'later' ? c.topic : (c.day ?? 0); if (!m.has(k)) m.set(k, []); m.get(k)!.push(c); });
    return [...m.entries()];
  }, [list, show]);

  return (
    <div>
      <div className="toolbar">
        <Segmented<Show>
          label="Which classes to show"
          value={show}
          onChange={setShow}
          options={[
            { value: 'todo', label: 'To do now', count: todo.length },
            { value: 'today', label: 'Today', count: todays.length },
            { value: 'all', label: 'All', count: planList.length },
            { value: 'done', label: 'Done', count: planList.filter(isDone).length },
            ...(laterList.length ? [{ value: 'later' as Show, label: 'Not taught yet', count: laterList.length }] : []),
          ]}
        />
        {perDay > 0 && daysLeft > 0 && <span className="muted toolbar__note">{perDay} class{perDay === 1 ? '' : 'es'} a day finishes everything by {longDate(end)}.</span>}
      </div>
      {show === 'later' && <p className="lede lede--tight">These are not scheduled in the 45 days. Tick them once your class has covered them.</p>}
      {list.length === 0 ? (
        <Empty title={show === 'todo' ? 'Nothing is overdue.' : show === 'today' ? 'No classes today.' : 'Nothing to show here.'}>
          {show === 'todo' ? 'Every class dated up to today is fully ticked.' : undefined}
        </Empty>
      ) : byDay.map(([key, items]) => {
        const first = items[0];
        const rel = first.date ? daysBetween(today, first.date) : null;
        return (
          <section key={String(key)} className="daygroup">
            <h3 className="daygroup__head">
              {show === 'later' ? String(key) : (
                <>
                  <span>Day {first.day}</span>
                  <span className="muted">{first.date ? longDate(first.date) : ''}</span>
                  {rel === 0 && <span className="pill pill--now">Today</span>}
                  {rel !== null && rel < 0 && items.some((c) => !isDone(c)) && <span className="pill pill--late">{-rel} day{rel === -1 ? '' : 's'} ago</span>}
                </>
              )}
            </h3>
            {items.map((c) => <ClassRow key={c.row} subject={id} item={c} />)}
          </section>
        );
      })}
    </div>
  );
}

export function TopicsTab({ id, list }: { id: ReturnType<typeof subjectMeta>['id']; list: ClassItem[] }) {
  const meta = subjectMeta(id);
  const [open, setOpen] = useState<string | null>(null);
  const groups = useMemo(() => topicGroups(list), [list]);
  if (!list.length) return <Empty title="No topics yet.">Topics come from the Topic column of your sheet.</Empty>;
  return (
    <ul className="topics">
      {groups.map((g) => {
        const isOpen = open === g.topic;
        const later = g.classes.filter((c) => c.section === 'later').length;
        return (
          <li key={g.topic} className="topic">
            <button type="button" className="topic__head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : g.topic)}>
              <span className="topic__name">{g.topic}</span>
              <span className="muted topic__meta">{g.progress.done} of {g.progress.total} done{later ? `, ${later} not taught yet` : ''}</span>
              <span className="topic__bar"><Bar value={g.progress.ratio} color={meta.color} /></span>
              <span className="num topic__pct">{Math.round(g.progress.ratio * 100)}%</span>
            </button>
            {isOpen && <div className="topic__body">{g.classes.map((c) => <ClassRow key={c.row} subject={id} item={c} showDate />)}</div>}
          </li>
        );
      })}
    </ul>
  );
}
