import { useState, type FormEvent } from 'react';
import { ExternalLink, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../state/store';
import { SUBJECTS, subjectMeta } from '../data/subjects';
import type { LibSection, SubjectId } from '../types';
import { Empty } from './ui';
import { dayMonth, todayISO } from '../lib/dates';

const gradeFor = (pct: number) => (pct >= 90 ? 'A*' : pct >= 80 ? 'A' : pct >= 70 ? 'B' : pct >= 60 ? 'C' : pct >= 50 ? 'D' : pct >= 40 ? 'E' : 'U');

/** Past paper log. Pass `subject` to lock it to one subject, or leave it out for the all-subjects view. */
export function PapersPanel({ subject }: { subject?: SubjectId }) {
  const { papers, addPaper, deletePaper } = useStore();
  const [open, setOpen] = useState(false);
  const [sub, setSub] = useState<SubjectId>(subject ?? 'maths');
  const [year, setYear] = useState(String(new Date().getFullYear() - 1));
  const [session, setSession] = useState<'May/June' | 'Oct/Nov' | 'Feb/March'>('May/June');
  const [paper, setPaper] = useState('');
  const [score, setScore] = useState('');
  const [total, setTotal] = useState('');
  const [notes, setNotes] = useState('');
  const list = papers.filter((p) => !subject || p.subject === subject);
  const scored = list.filter((p) => p.score !== null && p.total > 0);
  const avg = scored.length ? Math.round((scored.reduce((a, p) => a + (p.score! / p.total) * 100, 0) / scored.length)) : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    addPaper({
      subject: subject ?? sub, year: Number(year) || new Date().getFullYear(), session, paper: paper.trim() || 'Paper',
      score: score === '' ? null : Number(score), total: Number(total) || 0, date: todayISO(), notes: notes.trim(),
    });
    setPaper(''); setScore(''); setTotal(''); setNotes(''); setOpen(false);
  };

  return (
    <div>
      <div className="sechead">
        <h2>{subject ? 'Past papers' : 'Papers you have done'}</h2>
        <button type="button" className="btn btn--sm" onClick={() => setOpen(!open)}><Plus size={15} />Log a paper</button>
      </div>
      {avg !== null && <p className="lede lede--tight">Average {avg}% across {scored.length} marked paper{scored.length === 1 ? '' : 's'}, about a grade {gradeFor(avg)}.</p>}
      {open && (
        <form className="form" onSubmit={submit}>
          {!subject && (
            <label className="field"><span className="field__label">Subject</span>
              <select className="input" value={sub} onChange={(e) => setSub(e.target.value as SubjectId)}>
                {SUBJECTS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          )}
          <label className="field"><span className="field__label">Year</span><input className="input" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} /></label>
          <label className="field"><span className="field__label">Session</span>
            <select className="input" value={session} onChange={(e) => setSession(e.target.value as typeof session)}>
              <option>May/June</option><option>Oct/Nov</option><option>Feb/March</option>
            </select>
          </label>
          <label className="field"><span className="field__label">Paper and variant</span><input className="input" placeholder="e.g. Paper 22" value={paper} onChange={(e) => setPaper(e.target.value)} /></label>
          <label className="field"><span className="field__label">Your mark</span><input className="input" inputMode="numeric" value={score} onChange={(e) => setScore(e.target.value)} /></label>
          <label className="field"><span className="field__label">Out of</span><input className="input" inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value)} /></label>
          <label className="field field--wide"><span className="field__label">What went wrong or well</span><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
          <div className="form__actions"><button className="btn" type="submit">Save paper</button><button type="button" className="btn btn--ghost" onClick={() => setOpen(false)}>Cancel</button></div>
        </form>
      )}
      {list.length === 0 ? (
        <Empty title="No papers logged yet.">Log each past paper with your mark to see your average and spot weak subjects.</Empty>
      ) : (
        <ul className="rows">
          {list.map((p) => {
            const m = subjectMeta(p.subject);
            const pct = p.score !== null && p.total ? Math.round((p.score / p.total) * 100) : null;
            return (
              <li key={p.id} className="rows__item" style={{ ['--accent' as string]: m.color }}>
                <span className="dot" />
                <div className="rows__text">
                  <strong>{!subject && `${m.name}, `}{p.session} {p.year}, {p.paper}</strong>
                  <span className="muted">{dayMonth(p.date)}{p.notes ? `. ${p.notes}` : ''}</span>
                </div>
                <span className="num">{pct !== null ? `${p.score}/${p.total} (${pct}%)` : 'Not marked'}</span>
                <button type="button" className="iconbtn" aria-label="Delete paper" onClick={() => deletePaper(p.id)}><Trash2 size={15} /></button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function NotesPanel({ subject }: { subject?: SubjectId }) {
  const { notes, saveNote, deleteNote } = useStore();
  const list = notes.filter((n) => !subject || n.subject === subject).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = list.find((n) => n.id === activeId) ?? null;
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sub, setSub] = useState<SubjectId | ''>(subject ?? '');

  const pick = (id: string | null) => {
    setActiveId(id);
    const n = notes.find((x) => x.id === id);
    setTitle(n?.title ?? ''); setBody(n?.body ?? ''); setSub(n?.subject ?? subject ?? '');
  };
  const save = () => {
    if (!title.trim() && !body.trim()) return;
    const id = saveNote({ id: activeId ?? undefined, subject: (subject ?? (sub || null)) as SubjectId | null, title: title.trim() || 'Untitled note', body });
    setActiveId(id);
  };

  return (
    <div className="notes">
      <div className="notes__list">
        <button type="button" className="btn btn--sm" onClick={() => pick(null)}><Plus size={15} />New note</button>
        {list.length === 0 && <p className="muted">Notes you write here stay on this device. Notes on a class are saved in the sheet from the class row.</p>}
        <ul className="rows rows--tight">
          {list.map((n) => (
            <li key={n.id}>
              <button type="button" className={`notes__item ${n.id === activeId ? 'is-on' : ''}`} onClick={() => pick(n.id)}>
                <strong>{n.title}</strong>
                <span className="muted">{n.subject ? subjectMeta(n.subject).name : 'General'}, {dayMonth(n.updatedAt.slice(0, 10))}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="notes__editor">
        <input className="input input--title" placeholder="Note title" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={save} />
        {!subject && (
          <select className="input" aria-label="Subject" value={sub} onChange={(e) => setSub(e.target.value as SubjectId | '')} onBlur={save}>
            <option value="">General</option>
            {SUBJECTS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        <textarea className="input input--body" placeholder="Write here. Formulas, rules, mistakes you keep making." value={body} onChange={(e) => setBody(e.target.value)} onBlur={save} />
        <div className="form__actions">
          <button type="button" className="btn" onClick={save}>Save note</button>
          {active && <button type="button" className="btn btn--ghost" onClick={() => { deleteNote(active.id); pick(null); }}><Trash2 size={15} />Delete</button>}
        </div>
      </div>
    </div>
  );
}

/** Links to the subject's Google Sheet and any playlists found in it. */
export function SheetLinks({ subject }: { subject: SubjectId }) {
  const { plan } = useStore();
  const sp = plan[subject];
  if (!sp?.sheetUrl && !(sp?.extras.length)) return null;
  return (
    <section>
      <div className="sechead"><h2>Links from your sheet</h2></div>
      <ul className="rows">
        {sp?.sheetUrl && <li className="rows__item"><div className="rows__text"><strong>Open the Google Sheet</strong><span className="muted">The tracker this page reads from and writes to</span></div><a className="iconbtn" href={sp.sheetUrl} target="_blank" rel="noopener noreferrer" aria-label="Open the Google Sheet"><ExternalLink size={16} /></a></li>}
        {sp?.extras.map((x) => <li key={x.url} className="rows__item"><div className="rows__text"><strong>{x.title}</strong></div><a className="iconbtn" href={x.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${x.title}`}><ExternalLink size={16} /></a></li>)}
      </ul>
    </section>
  );
}

/** Web links (for example a Google Drive folder) for browsers or phones that cannot link a folder. */
export function OnlineLinks({ subject, section }: { subject: SubjectId; section: LibSection }) {
  const { files, addFile, deleteFile } = useStore();
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const mine = files.filter((f) => f.subject === subject && (f.section ?? 'notes') === section);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const u = url.trim();
    if (!u) return;
    addFile({ subject, section, title: title.trim() || u, url: /^https?:\/\//i.test(u) ? u : `https://${u}` });
    setTitle(''); setUrl('');
  };
  return (
    <details className="more" open={mine.length > 0}>
      <summary>Online links (Google Drive and other web links)</summary>
      <form className="form form--inline" onSubmit={submit}>
        <label className="field"><span className="field__label">Name</span><input className="input" placeholder="e.g. Drive folder" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="field field--wide"><span className="field__label">Link</span><input className="input" placeholder="https://drive.google.com/..." value={url} onChange={(e) => setUrl(e.target.value)} /></label>
        <div className="form__actions"><button className="btn" type="submit"><Plus size={15} />Add link</button></div>
      </form>
      {mine.length > 0 && (
        <ul className="rows">
          {mine.map((f) => (
            <li key={f.id} className="rows__item">
              <div className="rows__text"><strong>{f.title}</strong><span className="muted rows__url">{f.url}</span></div>
              <a className="iconbtn" href={f.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${f.title}`}><ExternalLink size={16} /></a>
              <button type="button" className="iconbtn" aria-label={`Remove ${f.title}`} onClick={() => deleteFile(f.id)}><Trash2 size={15} /></button>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
