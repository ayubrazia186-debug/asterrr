// A stand-in for sync/Code.gs so the app can be tried and tested without Google.
// It serves the same pull/push protocol from src/data/plan.seed.json, in memory.
//   node tools/mock-sheets-server.mjs            (port 8787, token "test")
// Test helpers: GET /__state, GET /__reset, POST /__edit {code,row,steps?,notes?}, GET /__fail?on=1|0, POST /__shift {code,by}
import http from 'node:http';
import { readFileSync } from 'node:fs';

const seed = JSON.parse(readFileSync(new URL('../src/data/plan.seed.json', import.meta.url), 'utf8'));
const TOKEN = process.env.TOKEN || 'test';
const PORT = Number(process.env.PORT || 8787);
let state = structuredClone(seed);
let failing = false;
const byCode = (code) => Object.values(state).find((s) => s.code === code);
const log = [];

const send = (res, obj, status = 200) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
};
const body = (req) => new Promise((r) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => r(b)); });

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }); return res.end(); }
  if (url.pathname === '/__reset') { state = structuredClone(seed); log.length = 0; failing = false; return send(res, { ok: true }); }
  if (url.pathname === '/__state') return send(res, { state, log });
  if (url.pathname === '/__fail') { failing = url.searchParams.get('on') === '1'; return send(res, { failing }); }
  if (url.pathname === '/__edit') {
    const e = JSON.parse(await body(req));
    const c = byCode(e.code).classes.find((x) => x.row === e.row);
    if (e.steps) c.steps = e.steps;
    if (e.notes !== undefined) c.notes = e.notes;
    return send(res, { ok: true });
  }
  if (url.pathname === '/__shift') {           // simulate someone inserting rows above in the sheet
    const e = JSON.parse(await body(req));
    byCode(e.code).classes.forEach((c) => { c.row += e.by; });
    return send(res, { ok: true });
  }
  if (failing) { res.writeHead(500, { 'Access-Control-Allow-Origin': '*' }); return res.end('boom'); }
  if (req.method === 'GET') {
    if (url.searchParams.get('token') !== TOKEN) return send(res, { ok: false, error: 'Wrong access code' });
    return send(res, { ok: true, subjects: Object.values(state).map((s) => ({ ...s, sheetUrl: `https://docs.google.com/spreadsheets/d/mock-${s.code}/edit` })) });
  }
  const b = JSON.parse(await body(req));
  if (b.token !== TOKEN) return send(res, { ok: false, error: 'Wrong access code' });
  const results = b.changes.map((c) => {
    const s = byCode(c.code);
    const row = s?.classes.find((x) => x.row === c.row);
    if (!row) return { ok: false, error: 'not-a-class-row' };
    if (row.topic !== c.topic || row.part !== c.part) return { ok: false, error: 'row-moved' };
    if (c.field === 'steps') row.steps = c.value;
    else if (c.field === 'notes') row.notes = String(c.value);
    else return { ok: false, error: 'bad-field' };
    log.push({ code: c.code, row: c.row, field: c.field });
    return { ok: true };
  });
  send(res, { ok: true, results });
}).listen(PORT, '127.0.0.1', () => console.log(`mock sheets on http://127.0.0.1:${PORT}/exec (token: ${TOKEN})`));
