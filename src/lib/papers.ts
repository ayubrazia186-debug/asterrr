// Reads Cambridge past-paper file names such as 0450_s23_qp_11.pdf and 0580_w22_ms_42.pdf.
import type { FNode } from '../types';
import { filesIn } from './folders';

export type Session = 'Feb/Mar' | 'May/Jun' | 'Oct/Nov';
export const SESSION_ORDER: Session[] = ['Feb/Mar', 'May/Jun', 'Oct/Nov'];
const SESSION: Record<string, Session> = { m: 'Feb/Mar', s: 'May/Jun', w: 'Oct/Nov' };
export const KIND_LABEL: Record<string, string> = { qp: 'Question paper', ms: 'Mark scheme', er: 'Examiner report', in: 'Insert', gt: 'Grade thresholds', ci: 'Confidential instructions', sf: 'Source files', sm: 'Specimen mark scheme' };

const RX = /(?:^|[^0-9])(\d{4})[_\- ]([smw])(\d{2})[_\- ]([a-z]{2})(?:[_\- ]?(\d{1,2}))?(?=[^0-9a-z]|$)/i;

export interface PaperFile { node: FNode; kind: string }
export interface Paper { id: string; year: number; session: Session; num: string; files: PaperFile[] }
export interface PapersIndex { papers: Paper[]; extras: Array<{ year: number; session: Session; files: PaperFile[] }>; unparsed: FNode[]; years: number[] }

export function indexPapers(root: FNode): PapersIndex {
  const map = new Map<string, Paper>();
  const sessionFiles = new Map<string, { year: number; session: Session; files: PaperFile[] }>();
  const unparsed: FNode[] = [];
  for (const node of filesIn(root)) {
    const m = RX.exec(node.name.replace(/\.[^.]+$/, ''));
    if (!m) { unparsed.push(node); continue; }
    const year = 2000 + Number(m[3]);
    const session = SESSION[m[2].toLowerCase()];
    const kind = m[4].toLowerCase();
    const num = m[5] ?? '';
    if (!session) { unparsed.push(node); continue; }
    if (!num) {
      const k = `${year}-${session}`;
      const g = sessionFiles.get(k) ?? { year, session, files: [] };
      g.files.push({ node, kind });
      sessionFiles.set(k, g);
      continue;
    }
    const id = `${year}-${session}-${num}`;
    const p = map.get(id) ?? { id, year, session, num, files: [] };
    p.files.push({ node, kind });
    map.set(id, p);
  }
  const papers = [...map.values()].sort((a, b) => b.year - a.year || SESSION_ORDER.indexOf(a.session) - SESSION_ORDER.indexOf(b.session) || a.num.localeCompare(b.num, undefined, { numeric: true }));
  const years = [...new Set([...papers.map((p) => p.year), ...[...sessionFiles.values()].map((s) => s.year)])].sort((a, b) => b - a);
  return { papers, extras: [...sessionFiles.values()], unparsed, years };
}

export const fileOfKind = (p: Paper, kind: string) => p.files.find((f) => f.kind === kind)?.node;
