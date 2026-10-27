// Yearly papers: reads Cambridge file names, groups by year and session, and opens a question paper beside its mark scheme.
import { useMemo, useState } from 'react';
import { Columns2, FileText, ListChecks } from 'lucide-react';
import type { FNode, SubjectId } from '../types';
import { useStore } from '../state/store';
import { courseKey, filesIn, prettyName } from '../lib/folders';
import { fileOfKind, indexPapers, KIND_LABEL, SESSION_ORDER, type Paper } from '../lib/papers';
import { cx } from '../lib/dates';
import { PenTick, Segmented } from './ui';
import { FileRow, FolderBrowser } from './FolderLibrary';
import { Study, type StudyItem } from './Study';

export function PapersLibrary({ subject, root, query }: { subject: SubjectId; root: FNode; query: string }) {
  const key = courseKey(subject);
  const { marks, toggleMark } = useStore();
  const done = useMemo(() => new Set(marks[key] ?? []), [marks, key]);
  const idx = useMemo(() => indexPapers(root), [root]);
  const [mode, setMode] = useState<'year' | 'folders'>(idx.papers.length ? 'year' : 'folders');
  const [year, setYear] = useState<number | 'all'>('all');
  const [num, setNum] = useState<string>('all');
  const [open, setOpen] = useState<{ title: string; items: StudyItem[]; start: string; beside?: string } | null>(null);

  const q = query.trim().toLowerCase();
  const nums = [...new Set(idx.papers.map((p) => p.num[0]))].sort();
  const shown = idx.papers.filter((p) =>
    (year === 'all' || p.year === year) && (num === 'all' || p.num[0] === num)
    && (!q || p.files.some((f) => f.node.path.toLowerCase().includes(q)) || `${p.year} ${p.session} paper ${p.num}`.toLowerCase().includes(q)));
  const byGroup = new Map<string, Paper[]>();
  for (const p of shown) { const k = `${p.year}|${p.session}`; byGroup.set(k, [...(byGroup.get(k) ?? []), p]); }
  const groups = [...byGroup.entries()].sort((a, b) => {
    const [ya, sa] = a[0].split('|'); const [yb, sb] = b[0].split('|');
    return Number(yb) - Number(ya) || SESSION_ORDER.indexOf(sa as never) - SESSION_ORDER.indexOf(sb as never);
  });

  const openPaper = (p: Paper, startKind: string, side?: string) => {
    const ordered = [...p.files].sort((a, b) => ['qp', 'ms'].indexOf(a.kind) - ['qp', 'ms'].indexOf(b.kind));
    const start = fileOfKind(p, startKind) ?? ordered[0].node;
    setOpen({
      title: `${p.year} ${p.session}, Paper ${p.num}`,
      items: ordered.map((f) => ({ node: f.node, group: KIND_LABEL[f.kind] ?? f.kind.toUpperCase() })),
      start: start.path,
      beside: side ? fileOfKind(p, side)?.path : undefined,
    });
  };

  if (mode === 'folders' || !idx.papers.length) {
    return (
      <>
        {idx.papers.length > 0 && <div className="toolbar"><Segmented<'year' | 'folders'> label="Papers view" value={mode} onChange={setMode} options={[{ value: 'year', label: 'By year' }, { value: 'folders', label: 'Folders' }]} /></div>}
        {!idx.papers.length && filesIn(root).length > 0 && <p className="muted">These file names are not in Cambridge format (like 0450_s23_qp_11.pdf), so they are shown as folders.</p>}
        <FolderBrowser subject={subject} root={root} query={query} noun="past papers" />
      </>
    );
  }

  const withMs = idx.papers.filter((p) => fileOfKind(p, 'ms')).length;
  return (
    <div className="papers">
      <div className="toolbar">
        <Segmented<'year' | 'folders'> label="Papers view" value={mode} onChange={setMode} options={[{ value: 'year', label: 'By year' }, { value: 'folders', label: 'Folders' }]} />
        <span className="muted">{idx.papers.length} papers, {withMs} with a mark scheme</span>
      </div>
      <div className="chiprow" role="group" aria-label="Year">
        <button type="button" className={cx('chipbtn', year === 'all' && 'is-on')} onClick={() => setYear('all')}>All years</button>
        {idx.years.map((y) => <button key={y} type="button" className={cx('chipbtn', year === y && 'is-on')} onClick={() => setYear(y)}>{y}</button>)}
        <span className="chiprow__sep" aria-hidden="true" />
        <button type="button" className={cx('chipbtn', num === 'all' && 'is-on')} onClick={() => setNum('all')}>Any paper</button>
        {nums.map((n) => <button key={n} type="button" className={cx('chipbtn', num === n && 'is-on')} onClick={() => setNum(n)}>Paper {n}</button>)}
      </div>

      {groups.length === 0 && <p className="muted">No papers match.</p>}
      {groups.map(([k, list]) => {
        const [y, sess] = k.split('|');
        return (
          <section key={k} className="psession">
            <div className="sechead"><h3>{y} <span className="muted">{sess}</span></h3></div>
            <div className="pgrid">
              {list.map((p, i) => {
                const qp = fileOfKind(p, 'qp');
                const ms = fileOfKind(p, 'ms');
                const isDone = qp ? done.has(qp.path) : false;
                const others = p.files.filter((f) => f.kind !== 'qp' && f.kind !== 'ms');
                return (
                  <div key={p.id} className={cx('pcard', isDone && 'is-done')} style={{ ['--i' as string]: i }}>
                    <div className="pcard__top">
                      <span className="pcard__num">Paper {p.num}</span>
                      {qp && (
                        <button type="button" className={cx('markbtn', isDone && 'is-on')} aria-pressed={isDone} aria-label={isDone ? `Unmark paper ${p.num} as done` : `Mark paper ${p.num} as done`} onClick={() => toggleMark(key, qp.path)}>
                          {isDone ? <PenTick size={16} /> : null}
                        </button>
                      )}
                    </div>
                    <div className="pcard__btns">
                      {qp && <button type="button" className="btn btn--sm btn--ghost" onClick={() => openPaper(p, 'qp')}><FileText size={14} />Paper</button>}
                      {ms && <button type="button" className="btn btn--sm btn--ghost" onClick={() => openPaper(p, 'ms')}><ListChecks size={14} />Marks</button>}
                      {qp && ms && <button type="button" className="btn btn--sm" onClick={() => openPaper(p, 'qp', 'ms')} title="Question paper and mark scheme side by side"><Columns2 size={14} />Both</button>}
                      {others.map((f) => <button key={f.node.path} type="button" className="chipbtn" onClick={() => openPaper(p, f.kind)} title={prettyName(f.node.name)}>{KIND_LABEL[f.kind] ?? f.kind.toUpperCase()}</button>)}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {idx.extras.length > 0 && !q && year === 'all' && (
        <section className="psession">
          <div className="sechead"><h3>Per session</h3><span className="muted">grade thresholds and similar</span></div>
          <ul className="files">
            {idx.extras.flatMap((e) => e.files.map((f) => ({ ...f, e }))).map((f) => (
              <FileRow key={f.node.path} node={f.node} hint={`${f.e.year} ${f.e.session}`} done={done.has(f.node.path)} onToggle={() => toggleMark(key, f.node.path)} onOpen={() => setOpen({ title: `${f.e.year} ${f.e.session}`, items: [{ node: f.node, group: '' }], start: f.node.path })} />
            ))}
          </ul>
        </section>
      )}
      {idx.unparsed.length > 0 && !q && year === 'all' && (
        <section className="psession">
          <div className="sechead"><h3>Other files</h3><span className="muted">names Aster could not read as papers</span></div>
          <ul className="files">
            {idx.unparsed.map((n) => <FileRow key={n.path} node={n} hint={n.path.split('/').slice(1, -1).join(' / ')} done={done.has(n.path)} onToggle={() => toggleMark(key, n.path)} onOpen={() => setOpen({ title: 'Other files', items: idx.unparsed.map((x) => ({ node: x, group: '' })), start: n.path })} />)}
          </ul>
        </section>
      )}

      {open && <Study libraryKey={key} subject={subject} title={open.title} items={open.items} start={open.start} beside={open.beside} onClose={() => setOpen(null)} />}
    </div>
  );
}
