export type SubjectId = 'maths' | 'accounting' | 'cs' | 'business' | 'english';

/** Video, Notes, Questions, Revise — same four tick boxes as the spreadsheets. */
export type Steps = [boolean, boolean, boolean, boolean];

export interface ClassItem {
  /** Spreadsheet row. With the subject it identifies the class. */
  row: number;
  day: number | null;
  date: string | null;
  section: 'plan' | 'later';
  topic: string;
  part: string;
  watch: string;
  linkText: string;
  link: string | null;
  passcode: string;
  taught: string;
  notes: string;
  steps: Steps;
}

export interface SubjectPlan {
  code: string;
  title: string;
  teacher: string;
  sheetUrl?: string;
  classes: ClassItem[];
  extras: Array<{ title: string; url: string }>;
}

export type PlanData = Partial<Record<SubjectId, SubjectPlan>>;

export interface SubjectMeta {
  id: SubjectId;
  name: string;
  code: string;
  color: string;
  tint: string;
}

export interface PendingChange {
  subject: SubjectId;
  row: number;
  topic: string;
  part: string;
  field: 'steps' | 'notes';
  value: Steps | string;
}

export interface Paper {
  id: string;
  subject: SubjectId;
  year: number;
  session: 'May/June' | 'Oct/Nov' | 'Feb/March';
  paper: string;
  score: number | null;
  total: number;
  date: string;
  notes: string;
  /** minutes it took, from the paper timer */
  minutes?: number;
}

/** A wrong answer you want to fix, or a point from an examiner report you want to remember. */
export interface Mistake {
  id: string;
  subject: SubjectId;
  kind: 'mistake' | 'examiner';
  topic: string;
  text: string;
  fix: string;
  /** where it came from, for example "May/June 2023 Paper 22 Q4" */
  source: string;
  date: string;
  fixed: boolean;
  updatedAt: string;
}

export interface Note {
  id: string;
  subject: SubjectId | null;
  title: string;
  body: string;
  updatedAt: string;
}

export type LibSection = 'topicals' | 'papers' | 'notes';

export interface FileLink {
  id: string;
  subject: SubjectId;
  /** Which library the link belongs to. Older links have none and show under Notes. */
  section?: LibSection;
  title: string;
  url: string;
}

export interface Card {
  id: string;
  subject: SubjectId;
  deck: string;
  front: string;
  back: string;
  /** Leitner box, 0 (new or forgotten) to 4 (well known) */
  box: number;
  /** Next review date, YYYY-MM-DD */
  due: string;
  reviews: number;
}

/** A file or folder inside a linked folder on this computer. */
export interface FNode {
  name: string;
  /** Path from the linked folder, with / between names. Empty for the folder itself. */
  path: string;
  kind: 'dir' | 'file';
  size?: number;
  children?: FNode[];
}

/** Where a file was moved by hand when the automatic grouping put it in the wrong place (or none). */
export interface TopicRef {
  key: string;
  title: string;
}

export interface Settings {
  name: string;
  examDate: string;
  /** exam date for each subject, YYYY-MM-DD */
  exams?: Partial<Record<SubjectId, string>>;
  /** "when and where I will study", one line per day */
  dayPlan?: Record<string, string>;
  syncUrl: string;
  syncToken: string;
}

export type SyncState = 'off' | 'idle' | 'syncing' | 'error';

export interface Persisted {
  v: 2;
  plan: PlanData;
  pending: PendingChange[];
  papers: Paper[];
  mistakes: Mistake[];
  notes: Note[];
  files: FileLink[];
  cards: Card[];
  /** Files ticked as done, per library: key is `subject:section`. */
  marks: Record<string, string[]>;
  /** Files moved to a topic by hand: subject, then path inside the linked folder. */
  assign: Record<string, Record<string, TopicRef>>;
  settings: Settings;
  lastSync: string | null;
}
