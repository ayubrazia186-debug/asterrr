import { useMemo, useState } from 'react';
import { ChevronRight, ChevronsRight, FolderOpen } from 'lucide-react';
import type { FNode, SubjectId } from '../types';
import { useStore } from '../state/store';
import { countFiles, courseKey, filesIn, prettyName, prettySize } from '../lib/folders';
import { Bar, ExtBadge, PenTick } from './ui';
import { cx } from '../lib/dates';
import { Study } from './Study';

/** Finds a folder inside a branch whose own path may not start at the top of the subject folder. */
export function findIn(root: FNode, path: string): FNode | null {
  if (path === root.path) return root;
  const base = root.path ? root.path.split('/').length : 0;
  let cur: FNode | undefined = root;
  for (const part of path.split('/').slice(base)) {
    cur = cur?.children?.find((c) => c.name === part);
    if (!cur) return null;
  }
  return cur ?? null;
}

/** Plain folder-by-folder browsing of any branch, with categories as cards. */
export function FolderBrowser({ subject, root, query, noun }: { subject: SubjectId; root: FNode; query: string; noun: string }) {
  const key = courseKey(subject);
  const { marks, toggleMark } = useStore();
  const done = useMemo(() => new Set(marks[key] ?? []), [marks, key]);
  const [path, setPath] = useState(root.path);
  const [reading, setReading] = useState<FNode | null>(null);

  const here = findIn(root, path) ?? root;
  const dirs = (here.children ?? []).filter((c) => c.kind === 'dir');
  const files = (here.children ?? []).filter((c) => c.kind === 'file');
  const q = query.trim().toLowerCase();
  const results = q ? filesIn(root).filter((x) => x.path.toLowerCase().includes(q)).slice(0, 150) : null;
  const base = root.path ? root.path.split('/').length : 0;
  const crumbs = path ? path.split('/').slice(base) : [];
  const doneIn = (n: FNode) => filesIn(n).filter((x) => done.has(x.path)).length;
  const readerList = results ?? files;

  return (
    <div className="lib">
      {results ? (
        <section>
          <div className="sechead"><h2>{results.length} result{results.length === 1 ? '' : 's'}</h2></div>
          {results.length === 0 ? <p className="muted">Nothing matches that. Try part of a file or folder name.</p> : (
            <ul className="files">{results.map((x) => <FileRow key={x.path} node={x} hint={x.path.split('/').slice(0, -1).join(' / ')} done={done.has(x.path)} onToggle={() => toggleMark(key, x.path)} onOpen={() => setReading(x)} />)}</ul>
          )}
        </section>
      ) : (
        <>
          <nav className="crumbs" aria-label="Folder path">
            <button type="button" onClick={() => setPath(root.path)} className={cx(path === root.path && 'is-here')}>{root.name}</button>
            {crumbs.map((c, i) => (
              <span key={i} className="crumbs__part">
                <ChevronRight size={14} aria-hidden="true" />
                <button type="button" className={cx(i === crumbs.length - 1 && 'is-here')} onClick={() => setPath(path.split('/').slice(0, base + i + 1).join('/'))}>{c}</button>
              </span>
            ))}
          </nav>

          {dirs.length > 0 && (
            <div className={cx('cats', path !== root.path && 'cats--small')}>
              {dirs.map((d, i) => {
                const total = countFiles(d);
                const dn = doneIn(d);
                return (
                  <button key={d.path} type="button" className="cat" style={{ ['--i' as string]: i }} onClick={() => setPath(d.path)}>
                    <FolderOpen size={22} strokeWidth={1.7} className="cat__icon" />
                    <span className="cat__name">{d.name}</span>
                    <span className="muted cat__meta">{total} file{total === 1 ? '' : 's'}{total ? `, ${dn} done` : ''}</span>
                    <Bar value={total ? dn / total : 0} color="var(--accent)" height={4} />
                    <ChevronsRight size={16} className="cat__go" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          )}

          {files.length > 0 && (
            <section>
              {dirs.length > 0 && <div className="sechead"><h2>Files here</h2><span className="muted">{doneIn(here)} of {files.length} done</span></div>}
              <ul className="files">{files.map((x) => <FileRow key={x.path} node={x} done={done.has(x.path)} onToggle={() => toggleMark(key, x.path)} onOpen={() => setReading(x)} />)}</ul>
            </section>
          )}
          {dirs.length === 0 && files.length === 0 && <p className="muted">This folder is empty. Add {noun} to it and press Refresh.</p>}
        </>
      )}

      {reading && (
        <Study
          libraryKey={key} subject={subject} title={here.name || root.name}
          items={readerList.map((n) => ({ node: n, group: '' }))} start={reading.path} onClose={() => setReading(null)}
        />
      )}
    </div>
  );
}

export function FileRow({ node, hint, done, onToggle, onOpen }: { node: FNode; hint?: string; done: boolean; onToggle: () => void; onOpen: () => void }) {
  return (
    <li className={cx('frow', done && 'is-done')}>
      <button type="button" className="frow__main" onClick={onOpen}>
        <ExtBadge name={node.name} />
        <span className="frow__text">
          <span className="frow__name">{prettyName(node.name)}</span>
          {hint && <span className="muted frow__hint">{hint}</span>}
        </span>
        <span className="muted frow__size">{prettySize(node.size)}</span>
      </button>
      <button type="button" className={cx('markbtn', done && 'is-on')} aria-pressed={done} aria-label={done ? `Unmark ${prettyName(node.name)} as done` : `Mark ${prettyName(node.name)} as done`} onClick={onToggle}>
        {done ? <PenTick size={17} /> : null}
      </button>
    </li>
  );
}
