// A section of a subject (Notes, Topicals, Papers) cut out of the subject's one linked folder.
import { useState } from 'react';
import type { LibSection, SubjectId } from '../types';
import { notesRoot, sectionRoot } from '../lib/sections';
import { AccessNotice, LibraryCTA, LinkBar, Loading, MissingFolder, useLinkedFolder } from './linked';
import { PapersLibrary } from './PapersLibrary';
import { TopicLibrary } from './TopicLibrary';

const PLACEHOLDER: Record<LibSection, string> = { notes: 'Search notes and videos', topicals: 'Search topical questions', papers: 'Search past papers' };

export function CourseView({ subject, section }: { subject: SubjectId; section: LibSection }) {
  const f = useLinkedFolder(subject);
  const [query, setQuery] = useState('');
  if (f.link === undefined) return <Loading />;
  if (f.link === null) return <LibraryCTA subject={subject} f={f} />;
  const link = f.link;

  let view;
  if (section === 'notes') {
    view = <TopicLibrary subject={subject} section="notes" root={notesRoot(link.root)} query={query} />;
  } else {
    const root = sectionRoot(link.root, section);
    if (!root) view = <MissingFolder section={section} subject={subject} />;
    else view = section === 'papers'
      ? <PapersLibrary subject={subject} root={root} query={query} />
      : <TopicLibrary subject={subject} section="topicals" root={root} query={query} />;
  }
  return (
    <div className="lib">
      <LinkBar
        link={link} busy={f.busy} query={query} setQuery={setQuery} placeholder={PLACEHOLDER[section]}
        onRescan={f.rescan} onChoose={() => void f.choose()} onUnlink={() => void f.unlink()}
      />
      <AccessNotice access={f.access} onAllow={f.reconnect} />
      {view}
    </div>
  );
}
