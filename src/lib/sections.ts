// One folder per subject holds everything. These helpers cut it into the sections of the app:
//   Notes     = the topic folders and loose files
//   Topicals  = a top-level folder called Topicals (or "Topical questions")
//   Papers    = a top-level folder called Past papers (or Papers)
//   Books     = a top-level folder called Books (shown inside Notes, under "Books and loose papers")
import type { FNode, LibSection } from '../types';

export const PAPERS_DIR = /^(past ?papers?|papers?|yearly papers?|exam papers?)$/i;
export const TOPICALS_DIR = /^(topicals?|topical questions?|questions? by topic)$/i;
export const BOOKS_DIR = /^(books?|textbooks?|references?)$/i;

const topDirs = (root: FNode) => (root.children ?? []).filter((c) => c.kind === 'dir');

/** The folder for Topicals or Papers, if it exists. */
export function sectionRoot(root: FNode, section: Exclude<LibSection, 'notes'>): FNode | null {
  const rx = section === 'papers' ? PAPERS_DIR : TOPICALS_DIR;
  return topDirs(root).find((d) => rx.test(d.name.trim())) ?? null;
}

/** The subject folder without its Topicals and Papers folders, which have their own sections. */
export function notesRoot(root: FNode): FNode {
  return { ...root, children: (root.children ?? []).filter((c) => !(c.kind === 'dir' && (PAPERS_DIR.test(c.name.trim()) || TOPICALS_DIR.test(c.name.trim())))) };
}

export const SECTION_FOLDER: Record<Exclude<LibSection, 'notes'>, string> = { topicals: 'Topicals', papers: 'Past papers' };

/** The recommended layout, written out for one subject. */
export function folderGuide(subjectFolder: string, topicStyle: 'dotted' | 'numbered' = 'dotted'): string {
  const t = topicStyle === 'dotted'
    ? ['1.1 Business activity', '1.2 Classification of business']
    : ['1) Basics of accounting', '2) Depreciation'];
  return [
    'D:\\ZAINEMETICS CRASHCOURSE\\',
    `  ${subjectFolder}\\        <- keep the [code]: it tells Aster the subject`,
    `    ${t[0]}\\            <- one folder per topic: number, then name`,
    '      lesson.mkv              <- videos: any names',
    '      notes.pdf               <- notes: any names',
    '      questions.pdf           <- "question" or "worksheet" in the name = Questions',
    `    ${t[1]}\\`,
    '    Topicals\\               <- optional: questions by topic',
    `      ${t[0]}\\`,
    '    Past papers\\            <- optional: any folders, names like 0450_s23_qp_11.pdf',
    '      0450_s23_qp_11.pdf',
    '      0450_s23_ms_11.pdf',
    '    Books\\                  <- optional: textbooks',
  ].join('\n');
}
