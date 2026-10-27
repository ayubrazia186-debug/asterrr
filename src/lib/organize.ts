// Turns whatever folder layout you have into topics.
//
//  * a folder per topic          "1) BASICS OF ACCOUNTING/…"            -> topic 1, Basics of accounting
//  * one flat folder             "Section 1 topic 4 Types of …pdf"      -> topic 1.4
//                                "3) 1.1 Business activity.mkv"         -> topic 1.1
//  * folders by type             "Videos/…", "Notes/…", "Past papers/…" -> not topics, the files inside are sorted by name
//  * a name it cannot read       "2026-07-14 16-11-26.mkv"              -> Unsorted: move it to a topic once, Aster remembers
import type { FNode, TopicRef } from '../types';
import { filesIn, kindOf, type FileKind } from './folders';
import { BOOKS_DIR } from './sections';

export type Role = 'video' | 'notes' | 'questions' | 'papers' | 'book' | 'other';
export const ROLE_LABEL: Record<Role, string> = {
  video: 'Videos', notes: 'Notes', questions: 'Questions', papers: 'Past papers', book: 'Books', other: 'Other files',
};
const ROLE_ORDER: Role[] = ['video', 'notes', 'questions', 'papers', 'other', 'book'];

export interface Item {
  node: FNode;
  media: FileKind;
  role: Role;
  /** Folders between the topic folder and the file, for example "Videos". */
  sub: string;
  /** True when Aster matched it to a topic by its words rather than by a number. */
  guessed: boolean;
  /** True when you moved it yourself. */
  manual: boolean;
}

export interface Topic {
  key: string;
  num: string | null;
  title: string;
  items: Item[];
  custom: boolean;
}

export interface Organized {
  topics: Topic[];
  /** Textbooks and loose past papers that belong to no topic. */
  reference: Item[];
  unsorted: Item[];
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

// Folders that say what is inside rather than which topic it is.
const TYPE_DIR = /^(notes?|videos?|video lectures?|lectures?|recordings?|class recordings?|classes|past ?papers?|papers?|topicals?|topical questions?|questions?|worksheets?|resources?|books?|textbooks?|mark ?schemes?|pdfs?|handouts?|slides?|ppts?|files|docs?|documents?|assignments?|homework|revision)$/i;

/** Takes off "Copy (3)-1" style endings, underscores and stray punctuation. */
function tidy(s: string): string {
  return s
    .replace(/_+/g, ' ')
    .replace(/\s*[-–]?\s*copy(\s*\(\d+\))?(\s*-\s*\d+)?\s*$/i, '')
    .replace(/\s*\(\d+\)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[\s\-–:.)]+/, '')
    .replace(/[\s\-–:.,(]+$/, '');
}

/** ALL CAPS and all lower case become a normal sentence. */
function nice(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (!t) return t;
  const base = /[a-z]/.test(t) ? t : t.toLowerCase();
  return base.charAt(0).toUpperCase() + base.slice(1);
}

const SECTION_TOPIC = /^(?:sec(?:tion)?)\.?\s*(\d+)\s*[,:_.\-–]*\s*(?:topic|chapter|ch|t)\.?\s*(\d+)\s*[\s,:_.)\-–]*(.*)$/i;
const DOTTED = /^(\d{1,2})\.(\d{1,2})(?!\d)\s*[\s:_.)\-–]*(.*)$/;
const WORDED = /^(?:chapter|ch|topic|unit|lesson|lecture|lec|part|module)\.?\s*(\d{1,2})\s*[\s:_.)\-–]*(.*)$/i;
const ORDINAL = /^(\d{1,2})\s*[).\-–_:]\s*(.*)$/;

export interface Parsed { key: string | null; ordinal: string | null; title: string }

export function parseName(raw: string, isDir: boolean): Parsed {
  const s = tidy(isDir ? raw : raw.replace(/\.[^./\\]{1,5}$/, ''));
  const strong = (t: string): { key: string; title: string } | null => {
    let m = SECTION_TOPIC.exec(t);
    if (m) return { key: `${+m[1]}.${+m[2]}`, title: m[3] };
    m = DOTTED.exec(t);
    if (m) return { key: `${+m[1]}.${+m[2]}`, title: m[3] };
    m = WORDED.exec(t);
    if (m) return { key: `${+m[1]}`, title: m[2] };
    return null;
  };
  const direct = strong(s);
  if (direct) return { key: direct.key, ordinal: null, title: nice(tidy(direct.title)) };
  let m = ORDINAL.exec(s);
  if (m) {
    const rest = tidy(m[2]);
    const inner = strong(rest);
    if (inner) return { key: inner.key, ordinal: m[1], title: nice(tidy(inner.title)) };
    // "3) Depreciation" is the third topic when it is a folder, only a running number when it is a file.
    return { key: isDir ? String(+m[1]) : null, ordinal: m[1], title: nice(rest) };
  }
  if (isDir) {
    m = /^(\d{1,2})\s+(\D.*)$/.exec(s);
    if (m) return { key: String(+m[1]), ordinal: m[1], title: nice(tidy(m[2])) };
  }
  return { key: null, ordinal: null, title: nice(s) };
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const STOP = new Set(['the', 'of', 'and', 'a', 'an', 'to', 'in', 'for', 'on', 'with', 'copy']);
const tokens = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((t) => t && !STOP.has(t) && !/^\d+$/.test(t));

function roleOf(media: FileKind, below: string, atRoot: boolean, node: FNode, keyed: boolean): Role {
  if (media === 'video' || media === 'audio') return 'video';
  const t = below.toLowerCase();
  if (/past ?paper|\bqp\b|\bms\b|mark ?scheme|\b\d{4}_[smw]\d{2}_|\bpaper ?\d/.test(t)) return 'papers';
  if (/topical|question|worksheet|exercise|practice|mcq|quiz|\btest\b|homework/.test(t)) return 'questions';
  if (atRoot && !keyed && media === 'pdf' && ((node.size ?? 0) > 6 * 1024 * 1024 || /\bbook\b|textbook|coursebook|frankwood/.test(t))) return 'book';
  return media === 'pdf' || media === 'image' || media === 'text' ? 'notes' : 'other';
}

interface Draft { key: string; num: string | null; titles: Array<{ t: string; prio: number }>; items: Item[]; custom: boolean }

export function organize(root: FNode, assign: Record<string, TopicRef> = {}): Organized {
  const drafts = new Map<string, Draft>();
  const reference: Item[] = [];
  const loose: Item[] = [];

  const put = (key: string, num: string | null, title: string, prio: number, item: Item, custom = false) => {
    let d = drafts.get(key);
    if (!d) { d = { key, num, titles: [], items: [], custom }; drafts.set(key, d); }
    if (title) d.titles.push({ t: title, prio });
    d.items.push(item);
  };

  for (const node of filesIn(root)) {
    const dirs = node.path.split('/').slice(0, -1);
    const topicIdx = dirs.findIndex((d) => !TYPE_DIR.test(d.trim()));
    const subDirs = topicIdx >= 0 ? dirs.slice(topicIdx + 1) : dirs;
    const media = kindOf(node.name);
    const base: Omit<Item, 'role'> = { node, media, sub: subDirs.join(' / '), guessed: false, manual: false };
    const own = assign[node.path];
    if (!own && dirs.some((d) => BOOKS_DIR.test(d.trim()))) { reference.push({ ...base, role: 'book' }); continue; }

    if (own) {
      const role = roleOf(media, [...subDirs, node.name].join('/'), false, node, true);
      const isCustom = own.key.startsWith('c:');
      put(own.key, isCustom ? null : own.key, own.title, 4, { ...base, role, manual: true }, isCustom);
      continue;
    }
    if (topicIdx >= 0) {
      const p = parseName(dirs[topicIdx], true);
      const key = p.key ?? `f:${slug(p.title)}`;
      const role = roleOf(media, [...subDirs, node.name].join('/'), false, node, true);
      put(key, p.key, p.title, 3, { ...base, role });
      continue;
    }
    // at the top of the linked folder (or only inside "Videos"/"Notes" style folders): read the file name
    const p = parseName(node.name, false);
    const role = roleOf(media, [...dirs, node.name].join('/'), true, node, p.key !== null);
    if (p.key) { put(p.key, p.key, p.title, media === 'pdf' ? 2 : 1, { ...base, role }); continue; }
    if (role === 'book' || role === 'papers') { reference.push({ ...base, role }); continue; }
    loose.push({ ...base, role });
  }

  // Unnumbered files: match them to a topic whose title words all appear in the file name.
  const unsorted: Item[] = [];
  const named = [...drafts.values()]
    .filter((d) => !d.custom)
    .map((d) => ({ d, t: tokens(pickTitle(d)) }))
    .filter((x) => x.t.length > 0 && (x.t.length >= 2 || x.t[0].length >= 7));
  for (const it of loose) {
    const ft = new Set(tokens(parseName(it.node.name, false).title));
    let best: { d: Draft; n: number } | null = null;
    for (const c of named) {
      if (c.t.every((w) => ft.has(w)) && (!best || c.t.length > best.n)) best = { d: c.d, n: c.t.length };
    }
    if (best) best.d.items.push({ ...it, guessed: true });
    else unsorted.push(it);
  }

  // "Topic 1 Business activity" and "1.1 Business activity" are the same topic written two ways: join them.
  const bySlug = new Map<string, Draft>();
  for (const d of [...drafts.values()]) {
    const sl = slug(pickTitle(d));
    const other = sl ? bySlug.get(sl) : undefined;
    if (other && !d.custom && !other.custom && other.num && d.num && (other.num.includes('.') !== d.num.includes('.'))) {
      const [keep, drop] = d.num.includes('.') ? [d, other] : [other, d];
      keep.items.push(...drop.items);
      keep.titles.push(...drop.titles);
      drafts.delete(drop.key);
      bySlug.set(sl, keep);
    } else if (sl) bySlug.set(sl, d);
  }

  const topics: Topic[] = [...drafts.values()].map((d) => ({
    key: d.key,
    num: d.num,
    title: pickTitle(d) || (d.num ? `Topic ${d.num}` : 'Untitled'),
    items: d.items.sort(byRole),
    custom: d.custom,
  }));
  topics.sort((a, b) => {
    if (a.num && b.num) return cmpKey(a.num, b.num);
    if (a.num) return -1;
    if (b.num) return 1;
    return collator.compare(a.title, b.title);
  });
  return { topics, reference: reference.sort(byRole), unsorted: unsorted.sort(byRole) };
}

function pickTitle(d: Draft): string {
  const best = [...d.titles].sort((a, b) => b.prio - a.prio || b.t.length - a.t.length)[0];
  return best?.t ?? '';
}

const cmpKey = (a: string, b: string) => {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? -1) !== (y[i] ?? -1)) return (x[i] ?? -1) - (y[i] ?? -1);
  return 0;
};

const byRole = (a: Item, b: Item) =>
  ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || collator.compare(a.node.path, b.node.path);

export const topicRef = (t: Topic): TopicRef => ({ key: t.key, title: t.title });
export const newTopicRef = (title: string): TopicRef => ({ key: `c:${slug(title) || 'topic'}`, title: nice(title) });
