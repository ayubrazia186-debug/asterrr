import { useMemo } from 'react';
import { Navigate, Outlet, useLocation, useParams } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { useStore } from '../../state/store';
import { isSubjectId, STEP_NAMES, subjectMeta } from '../../data/subjects';
import { behindOf, planClasses, progressOf } from '../../lib/plan';
import type { SubjectId } from '../../types';

export function useSubjectId(): SubjectId {
  const { id } = useParams();
  return id as SubjectId;
}

export function SubjectLayout() {
  const { id } = useParams();
  const { pathname } = useLocation();
  const { plan } = useStore();
  const valid = isSubjectId(id);
  const sp = valid ? plan[id] : undefined;
  const list = useMemo(() => planClasses(sp), [sp]);
  if (!valid) return <Navigate to="/" replace />;
  const meta = subjectMeta(id);
  const p = progressOf(list);
  const behind = behindOf(list).length;

  return (
    <div className="page" style={{ ['--accent' as string]: meta.color, ['--tint' as string]: meta.tint }}>
      <header className="sband sband--slim">
        <div className="sband__title">
          <span className="sband__code">{meta.code}</span>
          <h1>{meta.name}</h1>
          <p>{sp?.teacher ? `${sp.teacher}. ` : ''}{p.total ? `${p.done} of ${p.total} classes done${behind ? `, ${behind} behind schedule` : ', on schedule'}.` : 'No plan sheet connected for this subject yet.'}</p>
        </div>
        {p.total > 0 && (
          <div className="sband__stats">
            <div className="sband__pct"><span className="num num--hero">{Math.round(p.ratio * 100)}%</span><span>of steps ticked</span></div>
            <ul className="stepbars">
              {STEP_NAMES.map((n, i) => (
                <li key={n}>
                  <span>{n}</span>
                  <span className="stepbars__bar"><span style={{ width: `${(p.stepTicks[i] / p.total) * 100}%` }} /></span>
                  <span className="num">{p.stepTicks[i]}/{p.total}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {sp?.sheetUrl && <a className="sband__sheet" href={sp.sheetUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} />Open sheet</a>}
      </header>
      <div className="section" key={pathname}><Outlet /></div>
    </div>
  );
}
