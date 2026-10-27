// Notes: one folder per subject, grouped into topics whatever way the folder is organised.
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { setLast } from '../lib/last';
import { ArrowLeft, BookMarked, FileText, FolderOpen, HelpCircle, Layers3, PlayCircle, Video } from 'lucide-react';
import type { FNode, SubjectId } from '../types';
import { useStore } from '../state/store';
import { courseKey, prettyName, prettySize } from '../lib/folders';
import { newTopicRef, organize, ROLE_LABEL, topicRef, type Item, type Role, type Topic } from '../lib/organize';
import { getResume } from '../lib/resume';
import { cx } from '../lib/dates';
import { Bar, ExtBadge, PenTick } from './ui';
import { FileRow } from './FolderLibrary';
import { GuideTree } from './linked';
import { Study, type StudyItem } from './Study';

const EXAMPLE = [
  'Accounting                     one folder per topic',
  '  1) Basics of accounting',
  '    Notes.pdf',
  '    Lesson 1.mkv',
  '  2) Depreciation',
  '  Textbook.pdf                 loose books are kept aside',
  '',
  'Business                       or one flat folder',
  '  Section 1 topic 1 Business activity.pdf',
  '  3) 1.1 Business activity.mkv',
  '  2026-07-14 16-11-26.mkv      unreadable names wait in Unsorted',
];

type View = { kind: 'topic'; key: string } | { kind: 'reference' } | { kind: 'unsorted' } | null;

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function TopicLibrary({ subject, section, root, query }: { subject: SubjectId; section: 'notes' | 'topicals'; root: FNode; query: string }) {
  const key = courseKey(subject);
  const { marks, toggleMark, assign, assignFile } = useStore();
  const done = useMemo(() => new Set(marks[key] ?? []), [marks, key]);
  const mine = assign[subject];
  const org = useMemo(() => organize(root, mine ?? {}), [root, mine]);
  const [params] = useSearchParams();
  const [view, setView] = useState<View>(() => { const t = params.get('topic'); return t ? { kind: 'topic', key: t } : null; });
  const [study, setStudy] = useState<{ title: string; items: StudyItem[]; start: string } | null>(null);

  if (!org.topics.length && !org.unsorted.length && !org.reference.length) {
    return (
      <div className="lib-empty">
        <h2>Nothing in here yet</h2>
        <p className="lede">Add topic folders (or files whose names start with the topic number) to the {section === 'topicals' ? 'Topicals' : 'subject'} folder, then press Refresh.</p>
        <GuideTree subject={subject} />
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const all = [...org.topics.flatMap((t) => t.items), ...org.reference, ...org.unsorted];
  const results = q ? all.filter((i) => i.node.path.toLowerCase().includes(q)).slice(0, 150) : null;

  const topicChoices = org.topics.map((t) => ({ key: t.key, label: `${t.num ? `${t.num} ` : ''}${t.title}`, ref: topicRef(t) }));
  const move = (node: FNode, to: string) => {
    if (to === '__auto') { assignFile(subject, node.path, null); return; }
    if (to === '__new') {
      const name = window.prompt('Name for the new topic');
      if (name?.trim()) assignFile(subject, node.path, newTopicRef(name.trim()));
      return;
    }
    const c = topicChoices.find((x) => x.key === to);
    if (c) assignFile(subject, node.path, c.ref);
  };

  const openStudy = (title: string, list: Item[], start: FNode) => {
    if (view?.kind === 'topic') setLast({ subject, section, topicKey: view.key, title });
    openStudyNow(title, list, start);
  };
  const openStudyNow = (title: string, list: Item[], start: FNode) =>
    setStudy({ title, start: start.path, items: list.map((i) => ({ node: i.node, group: ROLE_LABEL[i.role] })) });

  const counts = (items: Item[]) => ({
    video: items.filter((i) => i.role === 'video').length,
    notes: items.filter((i) => i.role === 'notes').length,
    other: items.filter((i) => i.role !== 'video' && i.role !== 'notes').length,
    done: items.filter((i) => done.has(i.node.path)).length,
  });

  const totalVideos = all.filter((i) => i.role === 'video').length;
  const topic: Topic | null = view?.kind === 'topic' ? org.topics.find((t) => t.key === view.key) ?? null : null;
  const group: { title: string; items: Item[]; hint: string } | null =
    view?.kind === 'reference' ? { title: 'Books and loose papers', items: org.reference, hint: 'Textbooks and past papers that do not belong to one topic.' }
    : view?.kind === 'unsorted' ? { title: 'Unsorted', items: org.unsorted, hint: 'Aster could not tell which topic these belong to. Use “Move to…” once and it remembers.' }
    : topic ? { title: topic.title, items: topic.items, hint: '' } : null;

  return (
    <div className="lib">
      {results ? (
        <section>
          <div className="sechead"><h2>{results.length} result{results.length === 1 ? '' : 's'}</h2></div>
          {results.length === 0 ? <p className="muted">Nothing matches that. Try part of a file or topic name.</p> : (
            <ul className="files">
              {results.map((i) => <FileRow key={i.node.path} node={i.node} hint={i.node.path.split('/').slice(0, -1).join(' / ')} done={done.has(i.node.path)} onToggle={() => toggleMark(key, i.node.path)} onOpen={() => openStudy('Search results', results, i.node)} />)}
            </ul>
          )}
        </section>
      ) : group ? (
        <section className="topic">
          <button type="button" className="backlink" onClick={() => setView(null)}><ArrowLeft size={15} />All topics</button>
          <div className="topic__head">
            {topic?.num && <span className="topic__num">{topic.num}</span>}
            <div>
              <h2>{group.title}</h2>
              <p className="muted">{summary(counts(group.items))}{group.hint ? `. ${group.hint}` : ''}</p>
            </div>
            {group.items.length > 0 && (() => {
              const next = group.items.find((i) => !done.has(i.node.path)) ?? group.items[0];
              return <button type="button" className="btn" onClick={() => openStudy(group.title, group.items, next.node)}><PlayCircle size={17} />{counts(group.items).done ? 'Continue' : 'Start'}</button>;
            })()}
          </div>
          {group.items.length === 0 && <p className="muted">Nothing here.</p>}
          {(Object.keys(ROLE_LABEL) as Role[]).map((role) => {
            const rows = group.items.filter((i) => i.role === role);
            if (!rows.length) return null;
            return (
              <div key={role} className="rolegroup">
                <div className="sechead"><h3>{ROLE_LABEL[role]}</h3><span className="muted">{rows.filter((r) => done.has(r.node.path)).length} of {rows.length} done</span></div>
                <ul className="files">
                  {rows.map((it, i) => (
                    <li key={it.node.path} className={cx('frow', done.has(it.node.path) && 'is-done')} style={{ ['--i' as string]: i }}>
                      <button type="button" className="frow__main" onClick={() => openStudy(group.title, group.items, it.node)}>
                        <ExtBadge name={it.node.name} />
                        <span className="frow__text">
                          <span className="frow__name">{prettyName(it.node.name)}</span>
                          <span className="muted frow__hint">
                            {[it.sub, it.guessed ? 'matched by name' : '', it.manual ? 'moved by you' : '', resumeLabel(key, it)].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                        <span className="muted frow__size">{prettySize(it.node.size)}</span>
                      </button>
                      {(it.guessed || it.manual || view?.kind === 'unsorted' || view?.kind === 'reference') && (
                        <select className="movesel" aria-label={`Move ${prettyName(it.node.name)} to a topic`} value="" onChange={(e) => move(it.node, e.target.value)}>
                          <option value="" disabled>Move to…</option>
                          {topicChoices.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                          <option value="__new">New topic…</option>
                          {it.manual && <option value="__auto">Back to automatic</option>}
                        </select>
                      )}
                      <button type="button" className={cx('markbtn', done.has(it.node.path) && 'is-on')} aria-pressed={done.has(it.node.path)} aria-label={done.has(it.node.path) ? `Unmark ${prettyName(it.node.name)} as done` : `Mark ${prettyName(it.node.name)} as done`} onClick={() => toggleMark(key, it.node.path)}>
                        {done.has(it.node.path) ? <PenTick size={17} /> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      ) : (
        <>
          <div className="sechead">
            <h2>{org.topics.length} topic{org.topics.length === 1 ? '' : 's'}</h2>
            <span className="muted">{totalVideos} video{totalVideos === 1 ? '' : 's'}, {all.filter((i) => i.role === 'notes').length} notes</span>
          </div>
          {org.topics.length === 0 && org.unsorted.length === 0 && org.reference.length === 0 && <p className="muted">This folder has no files yet.</p>}
          <div className="tcards">
            {org.topics.map((t, i) => {
              const c = counts(t.items);
              return (
                <button key={t.key} type="button" className="tcard" style={{ ['--i' as string]: i }} onClick={() => setView({ kind: 'topic', key: t.key })}>
                  <span className="tcard__num">{t.num ?? <BookMarked size={16} />}</span>
                  <span className="tcard__title">{t.title}</span>
                  <span className="tcard__meta">
                    {c.video > 0 && <span><Video size={13} />{c.video}</span>}
                    {c.notes > 0 && <span><FileText size={13} />{c.notes}</span>}
                    {c.other > 0 && <span><HelpCircle size={13} />{c.other}</span>}
                  </span>
                  <Bar value={t.items.length ? c.done / t.items.length : 0} color="var(--accent)" height={4} />
                  <span className="muted tcard__done">{c.done} of {t.items.length} done</span>
                </button>
              );
            })}
            {org.reference.length > 0 && (
              <button type="button" className="tcard tcard--aside" style={{ ['--i' as string]: org.topics.length }} onClick={() => setView({ kind: 'reference' })}>
                <span className="tcard__num"><Layers3 size={16} /></span>
                <span className="tcard__title">Books and loose papers</span>
                <span className="muted tcard__done">{org.reference.length} file{org.reference.length === 1 ? '' : 's'}</span>
              </button>
            )}
            {org.unsorted.length > 0 && (
              <button type="button" className="tcard tcard--aside tcard--warn" style={{ ['--i' as string]: org.topics.length + 1 }} onClick={() => setView({ kind: 'unsorted' })}>
                <span className="tcard__num"><FolderOpen size={16} /></span>
                <span className="tcard__title">Unsorted</span>
                <span className="muted tcard__done">{org.unsorted.length} file{org.unsorted.length === 1 ? '' : 's'} to place</span>
              </button>
            )}
          </div>
        </>
      )}

      {study && <Study libraryKey={key} subject={subject} title={study.title} items={study.items} start={study.start} onClose={() => setStudy(null)} />}
    </div>
  );
}

function summary(c: { video: number; notes: number; other: number; done: number }) {
  const parts = [c.video && `${c.video} video${c.video === 1 ? '' : 's'}`, c.notes && `${c.notes} note${c.notes === 1 ? '' : 's'}`, c.other && `${c.other} other`].filter(Boolean);
  return parts.join(', ') || 'Empty';
}

function resumeLabel(key: string, it: Item): string {
  if (it.role !== 'video') return '';
  const at = getResume(`${key}:${it.node.path}`);
  return at > 5 ? `resume at ${mmss(at)}` : '';
}
