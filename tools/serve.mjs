// Aster library server. Run it on the computer that holds your course folder and open Aster from any device on the same Wi-Fi.
//
//   npm run serve                      (asks for the folder the first time and remembers it)
//   npm run serve -- "D:\ZAINEMETICS CRASHCOURSE"
//   options: --port 5174   --pin 123456   --no-pin
//
// It only READS your course folder (never writes there). It serves Aster itself from ./dist, streams videos with seeking,
// turns .mkv into .mp4 for devices that cannot play it (needs ffmpeg), and offers a small shared-data store
// in ./.aster-data (not used by the app yet).
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// ASTER_HOME and ASTER_DIST let the desktop app keep its data in the user's profile and its web files inside the install.
const HOME = process.env.ASTER_HOME ? path.resolve(process.env.ASTER_HOME) : APP;
const DIST = process.env.ASTER_DIST ? path.resolve(process.env.ASTER_DIST) : path.join(APP, 'dist');
const DATA = path.join(HOME, '.aster-data');
const CACHE = path.join(HOME, '.aster-cache');
const CONFIG = path.join(HOME, 'aster.config.json');
fs.mkdirSync(HOME, { recursive: true });

// ---------- settings ----------
const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const valueFlags = new Set(['--port', '--pin', '--host']);
const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && valueFlags.has(args[i - 1])));
let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8')); } catch { /* first run */ }

async function chooseRoot() {
  let root = positional[0] || process.env.ASTER_ROOT || cfg.root;
  if (!root) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    root = (await rl.question('Folder that holds your subject folders (for example D:\\ZAINEMETICS CRASHCOURSE): ')).trim().replace(/^"|"$/g, '');
    rl.close();
  }
  root = path.resolve(root);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) { console.error(`\nThat folder does not exist: ${root}`); process.exit(1); }
  return fs.realpathSync(root);
}
const ROOT = await chooseRoot();
const PORT = Number(flag('port') || process.env.PORT || cfg.port || 5174);
const NO_PIN = args.includes('--no-pin');
// --trust-local: this computer itself never needs the PIN (used by the desktop app); other devices still do.
const TRUST_LOCAL = args.includes('--trust-local');
const HOST = flag('host') || '0.0.0.0';
const PIN = NO_PIN ? '' : String(flag('pin') || cfg.pin || Math.floor(100000 + Math.random() * 900000));
const SECRET = cfg.secret || crypto.randomBytes(24).toString('hex');
// Remembered, so your tablet stays signed in after you restart the server.
try { fs.writeFileSync(CONFIG, JSON.stringify({ root: ROOT, port: PORT, pin: NO_PIN ? cfg.pin : PIN, secret: SECRET }, null, 2)); } catch { /* read-only install */ }
fs.mkdirSync(DATA, { recursive: true });
// when the desktop app that started this server is closed or killed, stop too (otherwise Windows keeps a hidden Aster.exe running and the installer cannot replace it)
if (process.env.ASTER_PARENT_PID) {
  const parent = Number(process.env.ASTER_PARENT_PID);
  setInterval(() => { try { process.kill(parent, 0); } catch { process.exit(0); } }, 2000).unref?.();
}
const FFMPEG = process.env.ASTER_FFMPEG || 'ffmpeg'; // the desktop app brings its own copy
const HAS_FFMPEG = spawnSync(FFMPEG, ['-version']).status === 0;

// ---------- subjects ----------
const CODES = { '0450': 'business', '0580': 'maths', '0452': 'accounting', '0478': 'cs', '0500': 'english' };
const WORDS = [[/business/i, 'business'], [/math/i, 'maths'], [/account/i, 'accounting'], [/computer|comp\s*sci/i, 'cs'], [/english/i, 'english']];
function subjectOf(name) {
  const m = /\b(0450|0580|0452|0478|0500)\b/.exec(name);
  if (m) return CODES[m[1]];
  for (const [rx, id] of WORDS) if (rx.test(name)) return id;
  return null;
}
async function subjectFolders() {
  const out = {};
  for (const e of await fsp.readdir(ROOT, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith('.')) continue;
    const id = subjectOf(e.name);
    if (id && !out[id]) out[id] = e.name;
  }
  // the chosen folder may itself be one subject
  const self = subjectOf(path.basename(ROOT));
  if (self && !Object.keys(out).length) out[self] = '';
  return out;
}

// ---------- auth ----------
const tokenFor = (pin) => crypto.createHmac('sha256', SECRET).update(pin).digest('hex');
const GOOD = tokenFor(PIN);
const cookieOf = (req) => Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p.length === 2));
const isLoopback = (req) => /^(::1|127\.\d+\.\d+\.\d+|::ffff:127\.\d+\.\d+\.\d+)$/.test(req.socket.remoteAddress || '');
const authed = (req) => !PIN || (TRUST_LOCAL && isLoopback(req)) || cookieOf(req).aster_auth === GOOD;
const attempts = new Map();

// ---------- helpers ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/webm', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4',
  '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.csv': 'text/plain; charset=utf-8',
};
const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
const readBody = (req, max = 8 * 1024 * 1024) => new Promise((resolve, reject) => {
  const chunks = []; let n = 0;
  req.on('data', (c) => { n += c.length; if (n > max) { reject(new Error('too big')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  req.on('error', reject);
});

/** Turns a subject id and a path inside its folder into a real path, or null if it would leave the folder. */
async function resolveIn(subject, rel) {
  const folders = await subjectFolders();
  if (!(subject in folders)) return null;
  const base = path.join(ROOT, folders[subject]);
  const parts = String(rel || '').split('/').filter(Boolean);
  if (parts.some((p) => p === '..' || p === '.' || p.includes('\0') || p.startsWith('.'))) return null;
  const full = path.join(base, ...parts);
  let real;
  try { real = await fsp.realpath(full); } catch { return null; }
  const realBase = await fsp.realpath(base);
  return real === realBase || real.startsWith(realBase + path.sep) ? real : null;
}

const SKIP = /^(\.|desktop\.ini$|thumbs\.db$|~\$)/i;
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
async function tree(subject) {
  const folders = await subjectFolders();
  const base = path.join(ROOT, folders[subject]);
  let count = 0;
  async function walk(dir, rel, depth) {
    const node = { name: rel ? path.basename(dir) : (folders[subject] || path.basename(ROOT)), path: rel, kind: 'dir', children: [] };
    if (depth > 12) return node;
    let entries = [];
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return node; }
    const kids = [];
    for (const e of entries) {
      if (SKIP.test(e.name) || count >= 40000) continue;
      count++;
      const p = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) kids.push(walk(path.join(dir, e.name), p, depth + 1));
      else if (e.isFile()) kids.push(fsp.stat(path.join(dir, e.name)).then((s) => ({ name: e.name, path: p, kind: 'file', size: s.size }), () => ({ name: e.name, path: p, kind: 'file' })));
    }
    node.children = (await Promise.all(kids)).sort((a, b) => (a.kind === b.kind ? collator.compare(a.name, b.name) : a.kind === 'dir' ? -1 : 1));
    return node;
  }
  const root = await walk(base, '', 0);
  return { name: root.name, scannedAt: new Date().toISOString(), root, count };
}

/** Sends a file with support for seeking (HTTP Range), which is what makes long videos jump instantly. */
function sendFile(req, res, file, type) {
  let st;
  try { st = fs.statSync(file); } catch { res.writeHead(404); return res.end('Not found'); }
  const headers = { 'content-type': type || MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'accept-ranges': 'bytes', 'cache-control': 'private, max-age=0', 'last-modified': st.mtime.toUTCString() };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range) {
    let start = range[1] === '' ? Math.max(0, st.size - Number(range[2])) : Number(range[1]);
    let end = range[1] === '' || range[2] === '' ? st.size - 1 : Math.min(Number(range[2]), st.size - 1);
    if (start > end || start >= st.size) { res.writeHead(416, { 'content-range': `bytes */${st.size}` }); return res.end(); }
    res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${st.size}`, 'content-length': end - start + 1 });
    if (req.method === 'HEAD') return res.end();
    const s = fs.createReadStream(file, { start, end });
    s.on('error', () => res.destroy());
    res.on('close', () => s.destroy());
    return s.pipe(res);
  }
  res.writeHead(200, { ...headers, 'content-length': st.size });
  if (req.method === 'HEAD') return res.end();
  const s = fs.createReadStream(file);
  s.on('error', () => res.destroy());
  res.on('close', () => s.destroy());
  s.pipe(res);
}

// ---------- mp4 for devices that cannot play mkv ----------
const jobs = new Map();
// reads the video/audio codec from ffmpeg's own description of the file (so ffprobe is not needed)
const probe = (file, sel) => {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-i', file], { encoding: 'utf8' });
  const kind = sel.startsWith('v') ? 'Video' : 'Audio';
  const m = new RegExp(`Stream #\\d+:\\d+[^:]*: ${kind}: ([a-z0-9_]+)`, 'i').exec(`${r.stderr || ''}`);
  return m ? m[1].toLowerCase() : '';
};
async function prepareMp4(file) {
  const st = await fsp.stat(file);
  const id = crypto.createHash('sha1').update(`${file}|${st.size}|${st.mtimeMs}`).digest('hex').slice(0, 20);
  const out = path.join(CACHE, `${id}.mp4`);
  if (fs.existsSync(out)) return id;
  if (jobs.has(id)) return jobs.get(id);
  const job = (async () => {
    await fsp.mkdir(CACHE, { recursive: true });
    const v = probe(file, 'v:0');
    const a = probe(file, 'a:0');
    const vArgs = v === 'h264' ? ['-c:v', 'copy'] : v === 'hevc' ? ['-c:v', 'copy', '-tag:v', 'hvc1'] : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p'];
    const aArgs = a === 'aac' ? ['-c:a', 'copy'] : a ? ['-c:a', 'aac', '-b:a', '128k'] : ['-an'];
    const tmp = `${out}.part.mp4`;
    await new Promise((resolve, reject) => {
      const p = spawn(FFMPEG, ['-v', 'error', '-y', '-i', file, '-map', '0:v:0', '-map', '0:a:0?', ...vArgs, ...aArgs, '-movflags', '+faststart', tmp]);
      let err = '';
      p.stderr.on('data', (d) => { err += d; });
      p.on('error', reject);
      p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err.slice(-400) || `ffmpeg exited ${code}`))));
    });
    await fsp.rename(tmp, out);
    return id;
  })().finally(() => jobs.delete(id));
  jobs.set(id, job);
  return job;
}

// ---------- shared data between your devices ----------
const NS = /^[a-z0-9_-]{1,40}$/;
const kvFile = (ns) => path.join(DATA, `${ns}.json`);
const kvRead = (ns) => { try { return JSON.parse(fs.readFileSync(kvFile(ns), 'utf8')); } catch { return { v: 0, value: null }; } };

// ---------- routes ----------
async function api(req, res, url) {
  const q = url.searchParams;
  if (url.pathname === '/api/info') {
    const ok = authed(req);
    return json(res, 200, { server: true, root: path.basename(ROOT), needsPin: !!PIN, authed: ok, ffmpeg: HAS_FFMPEG, subjects: ok ? await subjectFolders() : {} });
  }
  if (url.pathname === '/api/login' && req.method === 'POST') {
    const ip = req.socket.remoteAddress || '?';
    const rec = attempts.get(ip) || { n: 0, t: Date.now() };
    if (Date.now() - rec.t > 60_000) { rec.n = 0; rec.t = Date.now(); }
    if (rec.n >= 6) return json(res, 429, { error: 'Too many tries. Wait a minute.' });
    let body = {};
    try { body = JSON.parse(await readBody(req, 2000)); } catch { /* bad body */ }
    if (String(body.pin ?? '') !== PIN) { rec.n++; attempts.set(ip, rec); return json(res, 401, { error: 'Wrong PIN' }); }
    res.setHeader('set-cookie', `aster_auth=${GOOD}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 90}`);
    return json(res, 200, { ok: true });
  }
  if (!authed(req)) return json(res, 401, { error: 'PIN needed' });

  if (url.pathname === '/api/tree') {
    const subject = q.get('subject') || '';
    if (!(subject in (await subjectFolders()))) return json(res, 404, { error: 'No folder for this subject' });
    return json(res, 200, await tree(subject));
  }
  if (url.pathname === '/api/file') {
    const f = await resolveIn(q.get('subject') || '', q.get('path') || '');
    if (!f || !(await fsp.stat(f)).isFile()) { res.writeHead(404); return res.end('Not found'); }
    return sendFile(req, res, f);
  }
  if (url.pathname === '/api/prepare') {
    if (!HAS_FFMPEG) return json(res, 501, { error: 'ffmpeg is not installed on the computer running Aster' });
    const f = await resolveIn(q.get('subject') || '', q.get('path') || '');
    if (!f) return json(res, 404, { error: 'Not found' });
    try { return json(res, 200, { id: await prepareMp4(f) }); } catch (e) { return json(res, 500, { error: `Could not convert: ${e.message}` }); }
  }
  if (url.pathname === '/api/cached') {
    const id = (q.get('id') || '').replace(/[^a-f0-9]/g, '');
    return sendFile(req, res, path.join(CACHE, `${id}.mp4`), 'video/mp4');
  }
  const m = /^\/api\/kv(?:\/([^/]+))?$/.exec(url.pathname);
  if (m) {
    if (!m[1]) {
      const all = {};
      for (const f of await fsp.readdir(DATA)) if (f.endsWith('.json')) all[f.slice(0, -5)] = kvRead(f.slice(0, -5)).v;
      return json(res, 200, all);
    }
    const ns = m[1];
    if (!NS.test(ns)) return json(res, 400, { error: 'bad name' });
    if (req.method === 'GET') return json(res, 200, kvRead(ns));
    if (req.method === 'PUT') {
      let body;
      try { body = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: 'bad body' }); }
      const cur = kvRead(ns);
      if (Number(body.base) !== cur.v) return json(res, 409, cur);
      const next = { v: cur.v + 1, value: body.value };
      const tmp = `${kvFile(ns)}.tmp`;
      await fsp.writeFile(tmp, JSON.stringify(next));
      await fsp.rename(tmp, kvFile(ns));
      return json(res, 200, { v: next.v });
    }
  }
  return json(res, 404, { error: 'Unknown request' });
}

async function staticFile(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const full = path.join(DIST, path.normalize(rel).replace(/^([/\\])+/, ''));
  if (!full.startsWith(DIST + path.sep) && full !== DIST) { res.writeHead(403); return res.end(); }
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) { res.writeHead(404); return res.end('Not found'); }
  return sendFile(req, res, full);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
    return await staticFile(req, res, url);
  } catch (e) {
    if (!res.headersSent) json(res, 500, { error: String(e?.message || e) }); else res.destroy();
  }
});

server.listen(PORT, HOST, async () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  const folders = await subjectFolders();
  console.log('\n  Aster is running\n');
  console.log(`  This computer:   http://localhost:${PORT}`);
  if (HOST !== '127.0.0.1') for (const ip of ips) console.log(`  Tablet / phone:  http://${ip}:${PORT}    (same Wi-Fi)`);
  console.log(PIN ? `  PIN:             ${PIN}\n` : '  PIN:             off (anyone on your Wi-Fi can open your files)\n');
  console.log(`  Course folder:   ${ROOT}`);
  for (const [id, name] of Object.entries(folders)) console.log(`    ${id.padEnd(11)} ${name || '(this folder)'}`);
  if (!Object.keys(folders).length) console.log('    No subject folders found. Put the code in the folder name, for example "... BUSINESS STUDIES [0450]".');
  console.log(`  ffmpeg:          ${HAS_FFMPEG ? 'found (.mkv will be converted for iPad and iPhone)' : 'not found (iPad/iPhone cannot play .mkv; install ffmpeg to fix that)'}`);
  if (!fs.existsSync(path.join(DIST, 'index.html'))) console.log('\n  Note: the app is not built yet. Run "npm run build" first.');
  console.log('\n  Press Ctrl+C to stop.\n');
});
