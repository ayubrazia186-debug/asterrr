import { Link, NavLink, useMatch } from 'react-router-dom';
import {
  ArrowLeft, BrainCircuit, CalendarCheck, CalendarDays, CheckCheck, FileStack, LayoutGrid, ListChecks, NotebookText, Settings as Cog, Sparkles, Sun,
} from 'lucide-react';
import { SUBJECTS, isSubjectId, subjectMeta } from '../data/subjects';
import { useStore } from '../state/store';
import { Bar, SyncChip } from './ui';
import { planClasses, progressOf } from '../lib/plan';
import { cx } from '../lib/dates';

const SECTIONS = [
  { to: 'planner', label: 'Planner', short: 'Planner', icon: CalendarCheck },
  { to: 'topicals', label: 'Topicals', short: 'Topicals', icon: ListChecks },
  { to: 'papers', label: 'Yearly papers', short: 'Papers', icon: FileStack },
  { to: 'notes', label: 'Notes', short: 'Notes', icon: NotebookText },
  { to: 'flashcards', label: 'Flashcards', short: 'Cards', icon: BrainCircuit },
  { to: 'ai', label: 'AI tutor', short: 'AI', icon: Sparkles },
] as const;

function useSubjectRoute() {
  const m = useMatch('/s/:id/*');
  const id = m?.params.id;
  return isSubjectId(id) ? id : null;
}

export function Sidebar() {
  const { plan } = useStore();
  const sid = useSubjectRoute();
  const meta = sid ? subjectMeta(sid) : null;
  const p = sid ? progressOf(planClasses(plan[sid])) : null;

  return (
    <aside className="rail" aria-label="Main">
      <Link to="/" className="brand"><span className="brand__mark"><CheckCheck size={18} strokeWidth={2.6} /></span>Aster</Link>
      {meta && sid ? (
        <nav className="rail__panel" key={sid} aria-label={`${meta.name} sections`} style={{ ['--accent' as string]: meta.color, ['--tint' as string]: meta.tint }}>
          <Link to="/" className="rail__back"><ArrowLeft size={15} />All subjects</Link>
          <div className="rail__subject">
            <span className="rail__code">{meta.code}</span>
            <strong>{meta.name}</strong>
            {p && p.total > 0 && <><Bar value={p.ratio} color="#fff" height={5} /><span className="rail__pct">{Math.round(p.ratio * 100)}% of steps ticked</span></>}
          </div>
          <div className="rail__links">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              return <NavLink key={s.to} to={`/s/${sid}/${s.to}`} className={({ isActive }) => cx('navlink navlink--section', isActive && 'is-on')}><Icon size={18} />{s.label}</NavLink>;
            })}
          </div>
        </nav>
      ) : (
        <nav className="rail__panel" key="global" aria-label="Main navigation">
          <div className="rail__links">
            <NavLink to="/" end className={({ isActive }) => cx('navlink', isActive && 'is-on')}><LayoutGrid size={18} />Subjects</NavLink>
            <NavLink to="/today" className={({ isActive }) => cx('navlink', isActive && 'is-on')}><Sun size={18} />Today</NavLink>
            <NavLink to="/planner" className={({ isActive }) => cx('navlink', isActive && 'is-on')}><CalendarDays size={18} />All-subject planner</NavLink>
          </div>
          <div className="rail__group">Jump to a subject</div>
          <div className="rail__links">
            {SUBJECTS.map((s) => {
              const pp = progressOf(planClasses(plan[s.id]));
              return (
                <NavLink key={s.id} to={`/s/${s.id}/planner`} className="navlink navlink--subject" style={{ ['--accent' as string]: s.color }}>
                  <span className="navdot" />
                  <span className="navlink__name">{s.name}</span>
                  <span className="navlink__pct">{pp.total ? `${Math.round(pp.ratio * 100)}%` : ''}</span>
                </NavLink>
              );
            })}
          </div>
        </nav>
      )}
      <div className="rail__foot">
        <SyncChip full />
        <NavLink to="/settings" className={({ isActive }) => cx('navlink', isActive && 'is-on')}><Cog size={18} />Settings</NavLink>
      </div>
    </aside>
  );
}

export function MobileBar() {
  const sid = useSubjectRoute();
  const meta = sid ? subjectMeta(sid) : null;
  return (
    <>
      <header className="mtop">
        {meta ? (
          <Link to="/" className="mtop__back" style={{ ['--accent' as string]: meta.color }}><ArrowLeft size={18} /><span className="dot" />{meta.name}</Link>
        ) : (
          <Link to="/" className="brand"><span className="brand__mark"><CheckCheck size={16} strokeWidth={2.6} /></span>Aster</Link>
        )}
        <SyncChip />
      </header>
      <nav className="mnav" aria-label="Main">
        {sid ? SECTIONS.map((s) => {
          const Icon = s.icon;
          return <NavLink key={s.to} to={`/s/${sid}/${s.to}`} className={({ isActive }) => cx('mnav__item', isActive && 'is-on')}><Icon size={20} />{s.short}</NavLink>;
        }) : (
          <>
            <NavLink to="/" end className={({ isActive }) => cx('mnav__item', isActive && 'is-on')}><LayoutGrid size={20} />Subjects</NavLink>
            <NavLink to="/today" className={({ isActive }) => cx('mnav__item', isActive && 'is-on')}><Sun size={20} />Today</NavLink>
            <NavLink to="/planner" className={({ isActive }) => cx('mnav__item', isActive && 'is-on')}><CalendarDays size={20} />Planner</NavLink>
            <NavLink to="/settings" className={({ isActive }) => cx('mnav__item', isActive && 'is-on')}><Cog size={20} />Settings</NavLink>
          </>
        )}
      </nav>
    </>
  );
}
