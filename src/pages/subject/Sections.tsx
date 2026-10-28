import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { LibSection } from '../../types';
import { useStore } from '../../state/store';
import { subjectMeta } from '../../data/subjects';
import { laterClasses, pace, planClasses, planSpan } from '../../lib/plan';
import { todayISO } from '../../lib/dates';
import { PlanTab, TopicsTab, type Show } from '../../components/PlanViews';
import { CourseView } from '../../components/CourseView';
import { AiChat } from '../../components/AiChat';
import { MistakesPanel, NotesPanel, OnlineLinks, PapersPanel, SheetLinks } from '../../components/Panels';
import { Empty, Segmented } from '../../components/ui';
import { Flashcards } from './Flashcards';
import { useSubjectId } from './SubjectLayout';

function SectionTitle({ title, children }: { title: string; children?: string }) {
  return (
    <div className="sectitle">
      <h2>{title}</h2>
      {children && <p className="lede">{children}</p>}
    </div>
  );
}

export function PlannerSection() {
  const id = useSubjectId();
  const { plan } = useStore();
  const meta = subjectMeta(id);
  const [params] = useSearchParams();
  const [view, setView] = useState<'day' | 'topic'>('day');
  const sp = plan[id];
  const planList = planClasses(sp);
  const laterList = laterClasses(sp);
  const end = planSpan(plan)?.end ?? todayISO();
  const pc = pace(planList, end);
  const initial = (['todo', 'today', 'all', 'done', 'later'] as Show[]).find((s) => s === params.get('show'));

  if (!planList.length) {
    return (
      <>
        <SectionTitle title="Planner" />
        <Empty title="No plan for this subject yet.">Send me the {meta.name} sheet and its classes will appear here with the same four tick boxes.</Empty>
      </>
    );
  }
  return (
    <>
      <SectionTitle title="Planner">Your 45-day plan from the sheet. Ticks here are written back to it.</SectionTitle>
      <div className="toolbar">
        <Segmented<'day' | 'topic'> label="Group classes" value={view} onChange={setView} options={[{ value: 'day', label: 'By day' }, { value: 'topic', label: 'By topic' }]} />
      </div>
      {view === 'day'
        ? <PlanTab id={id} planList={planList} laterList={laterList} initial={initial} perDay={pc.perDay} daysLeft={pc.daysLeft} end={end} />
        : <TopicsTab id={id} list={[...planList, ...laterList]} />}
      <SheetLinks subject={id} />
    </>
  );
}

export function LibrarySection({ section }: { section: LibSection }) {
  const id = useSubjectId();
  const [tab, setTab] = useState<'folder' | 'extra'>('folder');
  const titles: Record<LibSection, string> = { topicals: 'Topicals', papers: 'Yearly papers', notes: 'Notes' };
  const extra = section === 'papers' ? 'My scores' : section === 'notes' ? 'Written notes' : null;
  return (
    <>
      <SectionTitle title={titles[section]}>{section === 'notes' ? 'Your videos and PDFs, sorted into topics. Click any file to study it right here.' : undefined}</SectionTitle>
      {extra && (
        <div className="toolbar">
          <Segmented<'folder' | 'extra'> label="View" value={tab} onChange={setTab} options={[{ value: 'folder', label: 'Folders' }, { value: 'extra', label: extra }]} />
        </div>
      )}
      {tab === 'folder' || !extra ? (
        <>
          <CourseView key={`${id}:${section}`} subject={id} section={section} />
          <OnlineLinks subject={id} section={section} />
        </>
      ) : section === 'papers' ? <PapersPanel subject={id} /> : <NotesPanel subject={id} />}
    </>
  );
}

export function FlashcardsSection() {
  const id = useSubjectId();
  return (
    <>
      <SectionTitle title="Flashcards">Short question and answer cards. Aster brings each one back just before you would forget it.</SectionTitle>
      <Flashcards subject={id} />
    </>
  );
}

export function AiSection() {
  const id = useSubjectId();
  const [params] = useSearchParams();
  const meta = subjectMeta(id);
  return (
    <>
      <SectionTitle title="AI tutor">{`Ask anything about ${meta.name}. To have it read your notes, open a PDF in Notes and press Ask AI.`}</SectionTitle>
      <AiChat key={id} subject={id} prefill={params.get('ask') ?? undefined} />
    </>
  );
}

export function MistakesSection() {
  const id = useSubjectId();
  return (
    <>
      <SectionTitle title="Mistakes">Learn from what went wrong, and keep the examiner&rsquo;s tips in one place.</SectionTitle>
      <MistakesPanel subject={id} />
    </>
  );
}
