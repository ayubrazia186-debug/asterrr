import type { PendingChange, SubjectId, SubjectPlan } from '../types';

const CODE_TO_ID: Record<string, SubjectId> = {
  '0580': 'maths',
  '0452': 'accounting',
  '0478': 'cs',
  '0450': 'business',
  '0500': 'english',
};

export interface PushResult {
  ok: boolean;
  error?: string;
}

async function readJson(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    // Apps Script returns an HTML page when the deployment is not set to "Anyone" or the URL is wrong.
    throw new Error('The sync URL did not return data. Check it is the Web app URL ending in /exec and access is set to Anyone.');
  }
}

export async function pullPlan(url: string, token: string): Promise<Partial<Record<SubjectId, SubjectPlan>>> {
  const u = new URL(url);
  u.searchParams.set('action', 'pull');
  u.searchParams.set('token', token);
  const res = await fetch(u.toString(), { method: 'GET', redirect: 'follow' });
  const body = await readJson(res);
  if (!body.ok) throw new Error(body.error || 'Sync failed');
  const out: Partial<Record<SubjectId, SubjectPlan>> = {};
  for (const s of body.subjects as SubjectPlan[]) {
    const id = CODE_TO_ID[s.code];
    if (id) out[id] = s;
  }
  return out;
}

export async function pushChanges(url: string, token: string, changes: PendingChange[]): Promise<PushResult[]> {
  // text/plain keeps this a "simple" request, so the browser skips the CORS preflight that Apps Script cannot answer.
  const res = await fetch(url, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      action: 'push',
      token,
      changes: changes.map((c) => ({
        code: Object.entries(CODE_TO_ID).find(([, id]) => id === c.subject)![0],
        row: c.row,
        topic: c.topic,
        part: c.part,
        field: c.field,
        value: c.value,
      })),
    }),
  });
  const body = await readJson(res);
  if (!body.ok) throw new Error(body.error || 'Sync failed');
  return body.results as PushResult[];
}
