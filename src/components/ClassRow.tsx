import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ChevronDown, Copy, ExternalLink, Sparkles } from 'lucide-react';
import { useLibrary } from '../lib/useLibrary';
import { bestTopic, organizedFor } from '../lib/match';
import { notesRoot } from '../lib/sections';
import type { ClassItem, SubjectId } from '../types';
import { subjectMeta } from '../data/subjects';
import { useStore } from '../state/store';
import { StepBoxes } from './ui';
import { cx, dayMonth } from '../lib/dates';
import { isDone, ticksOf } from '../lib/plan';

export function ClassRow({
  subject, item, showSubject = false, showDate = false,
}: { subject: SubjectId; item: ClassItem; showSubject?: boolean; showDate?: boolean }) {
  const { setStep, setAllSteps, setClassNotes, notify, assign } = useStore();
  const lib = useLibrary();
  const meta = subjectMeta(subject);
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(item.notes);
  const done = isDone(item);
  const tree = lib.trees[subject];
  const topic = useMemo(() => {
    if (!tree) return null;
    return bestTopic(`${item.topic} ${item.part} ${item.watch}`, organizedFor(notesRoot(tree.root), assign[subject]).topics);
  }, [tree, item.topic, item.part, item.watch, assign, subject]);

  // pick up changes that arrive from the sheet while the box is closed or untouched
  useEffect(() => { setNotes(item.notes); }, [item.notes]);

  const copyPasscode = async () => {
    try { await navigator.clipboard.writeText(item.passcode); notify('Passcode copied'); } catch { notify('Could not copy. Select the text instead.', 'warn'); }
  };

  return (
    <div className={cx('class', done && 'is-done', open && 'is-open')} style={{ ['--accent' as string]: meta.color, ['--tint' as string]: meta.tint }}>
      <div className="class__main">
        <div className="class__text">
          <div className="class__topic">
            {showSubject && <span className="class__subject">{meta.name}</span>}
            <span>{item.topic || 'Untitled topic'}</span>
            {showDate && item.date && <span className="class__date">{dayMonth(item.date)}</span>}
          </div>
          <div className="class__part">{item.part || item.topic}</div>
          {item.watch && item.watch !== item.part && <div className="class__watch">Watch: {item.watch}</div>}
        </div>
        <StepBoxes steps={item.steps} color={meta.color} onToggle={(i) => setStep(subject, item, i)} />
        <div className="class__actions">
          {item.link ? (
            <a className="iconbtn" href={item.link} target="_blank" rel="noopener noreferrer" aria-label={`Open recording: ${item.part || item.topic}`} title={item.linkText || 'Open recording'}>
              <ExternalLink size={16} />
            </a>
          ) : <span className="iconbtn iconbtn--empty" aria-hidden="true" />}
          {topic && (
            <Link className="iconbtn" to={`/s/${subject}/notes?topic=${encodeURIComponent(topic.key)}`} aria-label={`Study the notes for ${topic.title}`} title={`Notes and videos: ${topic.title}`}><BookOpen size={16} /></Link>
          )}
          <button type="button" className="iconbtn" aria-expanded={open} aria-label={open ? 'Hide details' : 'Show details and notes'} onClick={() => setOpen(!open)}>
            <ChevronDown size={16} className="chev" />
          </button>
        </div>
      </div>
      {open && (
        <div className="class__more">
          <div className="class__quick">
            <button type="button" className="btn btn--sm" onClick={() => setAllSteps(subject, item, !done)}>
              {done ? 'Clear all four' : 'Tick all four'}
            </button>
            <span className="muted">{ticksOf(item)} of 4 done{item.taught ? `. Taught on ${item.taught}` : ''}</span>
            <Link className="btn btn--sm btn--ghost" to={`/s/${subject}/ai?ask=${encodeURIComponent(`Teach me this class topic step by step, then give me 3 exam-style questions: ${item.topic}${item.part && item.part !== item.topic ? ` - ${item.part}` : ''}`)}`}><Sparkles size={14} /> Ask AI</Link>
            {item.passcode && (
              <button type="button" className="btn btn--sm btn--ghost" onClick={copyPasscode}>
                <Copy size={14} /> Copy passcode
              </button>
            )}
          </div>
          <label className="field">
            <span className="field__label">My notes (saved to the sheet)</span>
            <textarea
              className="input"
              rows={3}
              value={notes}
              placeholder="Write what the class covered, mistakes to avoid, formulas to remember"
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => { if (notes !== item.notes) setClassNotes(subject, item, notes); }}
            />
          </label>
        </div>
      )}
    </div>
  );
}
