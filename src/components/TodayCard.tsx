import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Clock, Flame, MapPin } from 'lucide-react';
import { SUBJECTS, subjectMeta } from '../data/subjects';
import { useStore } from '../state/store';
import { behindOf, planClasses, todayOf, isDone } from '../lib/plan';
import { daysBetween, todayISO } from '../lib/dates';
import { studiedMinutes, useLock } from '../lib/lock';
import { weakTopics } from '../lib/weak';

export function TodayCard() {
  const { plan, settings, updateSettings, mistakes, cards, papers } = useStore();
  const { state } = useLock();
  const today = todayISO();
  const info = useMemo(() => {
    const rows = SUBJECTS.flatMap((s) => todayOf(planClasses(plan[s.id])));
    const late = SUBJECTS.flatMap((s) => behindOf(planClasses(plan[s.id])).filter((c) => !isDone(c)));
    return { total: rows.length, done: rows.filter(isDone).length, late: late.length };
  }, [plan]);
  const exams = SUBJECTS.map((s) => ({ s, d: settings.exams?.[s.id] ?? '' }))
    .filter((e) => e.d && e.d >= today).map((e) => ({ ...e, left: daysBetween(today, e.d) })).sort((a, b) => a.left - b.left);
  const next = exams[0];
  const mins = Math.round(studiedMinutes(state, today));
  const weak = useMemo(() => weakTopics(mistakes, cards, papers, 3), [mistakes, cards, papers]);
  const line = settings.dayPlan?.[today] ?? '';

  return (
    <section className="todaycard" aria-label="Today">
      <div className="todaycard__grid">
        <div className="todaycard__cell">
          <CalendarClock size={18} aria-hidden="true" />
          {next
            ? <span><strong className="num">{next.left}</strong> day{next.left === 1 ? '' : 's'} to {subjectMeta(next.s.id).name}<span className="muted">{exams.length > 1 ? ` (${exams.length} exams ahead)` : ''}</span></span>
            : <span className="muted">Add exam dates in Settings, General.</span>}
        </div>
        <div className="todaycard__cell">
          <Flame size={18} aria-hidden="true" />
          <span><strong className="num">{info.done}/{info.total}</strong> of today&rsquo;s classes{info.late > 0 && <> · <strong className="num">{info.late}</strong> late</>}</span>
        </div>
        <div className="todaycard__cell">
          <Clock size={18} aria-hidden="true" />
          <span><strong className="num">{mins}</strong> min studied today</span>
        </div>
      </div>
      <label className="todaycard__plan">
        <MapPin size={16} aria-hidden="true" />
        <input className="input" value={line} maxLength={120} placeholder="When and where will you study today? For example: 5 pm, desk, maths paper 2"
          onChange={(e) => updateSettings({ dayPlan: { ...(settings.dayPlan ?? {}), [today]: e.target.value } })} aria-label="When and where I will study today" />
      </label>
      {weak.length > 0 && (
        <div className="todaycard__weak">
          <strong>Revise first</strong>
          <ul>{weak.map((w) => (
            <li key={`${w.subject}${w.topic}`}><Link to={`/s/${w.subject}/mistakes`}>{subjectMeta(w.subject).name}: {w.topic}</Link><span className="muted"> {w.why}</span></li>
          ))}</ul>
        </div>
      )}
    </section>
  );
}
