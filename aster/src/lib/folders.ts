// Where your files come from. Two ways, both read-only:
//   * "local": the browser's File System Access API (Chrome, Edge on a computer). You link your library folder once.
//   * "server": Aster was opened from the library server (tools/serve.mjs) running on your computer. This is how a
//     tablet or phone reaches your files. No folder picker, no re-allow prompts, and videos stream with seeking.
// Either way nothing is uploaded anywhere.
import type { FNode, LibSection, SubjectId } from '../types';

export type LibKey = `${SubjectId}:${LibSection}`;
export const libKey = (s: SubjectId, section: LibSection): LibKey => `${s}:${section}`;
/** One folder per subject holds everything. Notes, Topicals and Papers are views of it. */
export const courseKey = (s: SubjectId): LibKey => libKey(s, 'notes');
const subjectOfKey = (k: string) => k.split(':')[0] as SubjectId;

const CODES: Record<string, SubjectId> = { '0450': 'business', '0580': 'maths', '0452': 'accounting', '0478': 'cs', '0500': 'english' };
const WORDS: Array<[RegExp, SubjectId]> = [[/business/i, 'business'], [/math/i, 'maths'], [/account/i, 'accounting'], [/computer|comp\s*sci/i, 'cs'], [/english/i, 'english']];
/** "SIR SAAD HASSAN BUSINESS STUDIES [0450]" -> business. The syllabus code is what counts. */
export function subjectOfFolder(name: string): SubjectId | null {
  const m = /\b(0450|0580|0452|0478|0500)\b/.exec(name);
  if (m) return CODES[m[1]];
  for (const [rx, id] of WORDS) if (rx.test(name)) return id;
  return null;
}

// ---- library server (tablet / phone) ----------------------------------------
export interface ServerInfo { server: true; root: string; needsPin: boolean; authed: boolean; ffmpeg: boolean; subjects: Partial<Record<SubjectId, string>> }
let server: ServerInfo | null = null;
export const serverInfo = () => server;
export const isServer = () => server !== null;

export async function detectServer(): Promise<ServerInfo | null> {
  try {
    const r = await fetch('/api/info', { signal: AbortSignal.timeout(2500) });
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return null;
    const j = (await r.json()) as ServerInfo;
    if (j && j.server === true) { server = j; return j; }
  } catch { /* not served by the library server */ }
  return null;
}
export async function loginServer(pin: string): Promise<string | null> {
  const r = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin }) });
  if (!r.ok) return ((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'That did not work.';
  await detectServer();
  return null;
}
const serverFileUrl = (subject: SubjectId, path: string) => `/api/file?subject=${subject}&path=${encodeURIComponent(path)}`;
/** A streaming address for a file, when served from the library server. */
export const fileUrl = (key: LibKey, path: string): string | null => (server ? serverFileUrl(subjectOfKey(key), path) : null);
/** Asks the computer to convert a video to .mp4 (for iPad, iPhone and any browser that cannot play .mkv). */
export async function prepareVideo(key: LibKey, path: string): Promise<string> {
  const r = await fetch(`/api/prepare?subject=${subjectOfKey(key)}&path=${encodeURIComponent(path)}`);
  const j = (await r.json().catch(() => ({}))) as { id?: string; error?: string };
  if (!r.ok || !j.id) throw new Error(j.error ?? 'Could not convert this video.');
  return `/api/cached?id=${j.id}`;
}
async function serverTree(subject: SubjectId): Promise<LinkedTree | null> {
  if (!server?.subjects[subject] && server?.subjects[subject] !== '') return null;
  const r = await fetch(`/api/tree?subject=${subject}`);
  if (!r.ok) return null;
  return (await r.json()) as LinkedTree;
}

export interface LinkedTree {
  name: string;
  scannedAt: string;
  root: FNode;
  count: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export const folderAccessSupported = () => isServer() || typeof (window as any).showDirectoryPicker === 'function';

// ---- tiny IndexedDB wrapper ------------------------------------------------
const DB = 'aster-files';
const open = () =>
  new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('handles');
      r.result.createObjectStore('trees');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
async function idb<T>(store: 'handles' | 'trees', mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((res, rej) => {
    const req = fn(db.transaction(store, mode).objectStore(store));
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

// ---- scanning ----------------------------------------------------------------
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const SKIP = /^(\.|desktop\.ini$|thumbs\.db$|~\$)/i;
const MAX_ENTRIES = 40_000;

export async function scanFolder(handle: FileSystemDirectoryHandle): Promise<LinkedTree> {
  let count = 0;
  async function walk(dir: FileSystemDirectoryHandle, path: string, depth: number): Promise<FNode> {
    const node: FNode = { name: dir.name, path, kind: 'dir', children: [] };
    if (depth > 12) return node;
    const kids: Array<Promise<FNode>> = [];
    for await (const [name, h] of (dir as any).entries() as AsyncIterable<[string, FileSystemHandle]>) {
      if (SKIP.test(name) || count >= MAX_ENTRIES) continue;
      count++;
      const p = path ? `${path}/${name}` : name;
      if (h.kind === 'directory') kids.push(walk(h as FileSystemDirectoryHandle, p, depth + 1));
      else
        kids.push(
          (h as FileSystemFileHandle).getFile().then(
            (f) => ({ name, path: p, kind: 'file' as const, size: f.size }),
            () => ({ name, path: p, kind: 'file' as const }),
          ),
        );
    }
    const done = await Promise.all(kids);
    node.children = done.sort((a, b) => (a.kind === b.kind ? collator.compare(a.name, b.name) : a.kind === 'dir' ? -1 : 1));
    return node;
  }
  const root = await walk(handle, '', 0);
  return { name: handle.name, scannedAt: new Date().toISOString(), root, count };
}

// ---- linking ------------------------------------------------------------------
interface LibraryMap { name: string; folders: Partial<Record<SubjectId, string>> }
const LIB = '__library';
const loadMap = async () => ((await idb('trees', 'readonly', (st) => st.get(LIB))) as LibraryMap | undefined) ?? null;

export async function loadLink(key: LibKey): Promise<LinkedTree | null> {
  if (server) return serverTree(subjectOfKey(key));
  return ((await idb('trees', 'readonly', (st) => st.get(key))) as LinkedTree | undefined) ?? null;
}

/** Opens the folder picker for ONE subject folder. Must be called from a click. */
export async function linkFolder(key: LibKey): Promise<LinkedTree | null> {
  let handle: FileSystemDirectoryHandle;
  try {
    handle = await (window as any).showDirectoryPicker({ id: key.replace(':', '-'), mode: 'read' });
  } catch (e) {
    if ((e as DOMException)?.name === 'AbortError') return null; // closed the picker
    throw e;
  }
  const tree = await scanFolder(handle);
  const map = await loadMap();
  if (map && map.folders[subjectOfKey(key)]) { delete map.folders[subjectOfKey(key)]; await idb('trees', 'readwrite', (st) => st.put(map, LIB)); }
  live.set(key, handle);
  await idb('handles', 'readwrite', (st) => st.put(handle, key));
  await idb('trees', 'readwrite', (st) => st.put(tree, key));
  return tree;
}

export interface LibraryResult { rootName: string; linked: SubjectId[]; unmatched: string[] }

/**
 * Link the folder that holds ALL your subject folders (for example D:\ZAINEMETICS CRASHCOURSE). Each subfolder is matched to
 * a subject by the syllabus code in its name, such as [0450]. One permission covers every subject.
 */
export async function linkLibrary(): Promise<LibraryResult | null> {
  let root: FileSystemDirectoryHandle;
  try {
    root = await (window as any).showDirectoryPicker({ id: 'aster-library', mode: 'read' });
  } catch (e) {
    if ((e as DOMException)?.name === 'AbortError') return null;
    throw e;
  }
  const folders: Partial<Record<SubjectId, string>> = {};
  const unmatched: string[] = [];
  for await (const [name, h] of (root as any).entries() as AsyncIterable<[string, FileSystemHandle]>) {
    if (h.kind !== 'directory' || SKIP.test(name)) continue;
    const id = subjectOfFolder(name);
    if (id && !folders[id]) folders[id] = name; else unmatched.push(name);
  }
  // The folder you picked may itself be one subject: link it as that subject.
  const self = subjectOfFolder(root.name);
  if (!Object.keys(folders).length && self) {
    const key = courseKey(self);
    const tree = await scanFolder(root);
    live.set(key, root);
    await idb('handles', 'readwrite', (st) => st.put(root, key));
    await idb('trees', 'readwrite', (st) => st.put(tree, key));
    return { rootName: root.name, linked: [self], unmatched: [] };
  }
  const map: LibraryMap = { name: root.name, folders };
  await idb('handles', 'readwrite', (st) => st.put(root, LIB));
  await idb('trees', 'readwrite', (st) => st.put(map, LIB));
  live.set(LIB, root);
  const linked: SubjectId[] = [];
  for (const [id, name] of Object.entries(folders) as Array<[SubjectId, string]>) {
    const key = courseKey(id);
    const h = await root.getDirectoryHandle(name);
    live.set(key, h);
    const subjectTree = await scanFolder(h);
    await idb('trees', 'readwrite', (st) => st.put(subjectTree, key));
    linked.push(id);
  }
  return { rootName: root.name, linked, unmatched };
}

export async function unlinkFolder(key: LibKey) {
  live.delete(key);
  const map = await loadMap();
  const id = subjectOfKey(key);
  if (map && map.folders[id]) {
    delete map.folders[id];
    if (Object.keys(map.folders).length) await idb('trees', 'readwrite', (st) => st.put(map, LIB));
    else { await idb('trees', 'readwrite', (st) => st.delete(LIB)); await idb('handles', 'readwrite', (st) => st.delete(LIB)); live.delete(LIB); }
  }
  await idb('handles', 'readwrite', (st) => st.delete(key));
  await idb('trees', 'readwrite', (st) => st.delete(key));
}

// Handles are also kept in memory so reading files does not need a database round trip every time.
const live = new Map<string, FileSystemDirectoryHandle>();

async function storedHandle(key: string): Promise<FileSystemDirectoryHandle | null> {
  const cached = live.get(key);
  if (cached) return cached;
  const stored = ((await idb('handles', 'readonly', (st) => st.get(key))) as FileSystemDirectoryHandle | undefined) ?? null;
  if (stored) live.set(key, stored);
  return stored;
}

/** The folder for a subject: taken from the linked library when it is part of one, otherwise from its own link. */
async function handleFor(key: LibKey): Promise<FileSystemDirectoryHandle | null> {
  const own = live.get(key);
  if (own) return own;
  const map = await loadMap();
  const folder = map?.folders[subjectOfKey(key)];
  if (map && folder) {
    const root = await storedHandle(LIB);
    if (!root) return null;
    try {
      const h = await root.getDirectoryHandle(folder);
      live.set(key, h);
      return h;
    } catch { return null; }
  }
  return storedHandle(key);
}
/** The handle that permission is asked on: the library folder, or the subject's own folder. */
async function permissionHandle(key: LibKey): Promise<FileSystemDirectoryHandle | null> {
  const map = await loadMap();
  if (map?.folders[subjectOfKey(key)]) return storedHandle(LIB);
  return storedHandle(key);
}

export type Access = 'granted' | 'needs-permission' | 'missing';

export async function accessState(key: LibKey): Promise<Access> {
  if (server) return server.subjects[subjectOfKey(key)] !== undefined ? 'granted' : 'missing';
  const h = await permissionHandle(key);
  if (!h) return 'missing';
  return (await (h as any).queryPermission({ mode: 'read' })) === 'granted' ? 'granted' : 'needs-permission';
}

/** Asks the browser to let Aster read the folder again. Must be called from a click. */
export async function reconnect(key: LibKey): Promise<boolean> {
  if (server) return true;
  const h = await permissionHandle(key);
  if (!h) return false;
  return (await (h as any).requestPermission({ mode: 'read' })) === 'granted';
}

export async function rescan(key: LibKey): Promise<LinkedTree> {
  if (server) {
    const t = await serverTree(subjectOfKey(key));
    if (!t) throw new Error('Your computer has no folder for this subject.');
    return t;
  }
  const perm = await permissionHandle(key);
  if (!perm) throw new Error('This folder is not linked any more. Link your library again.');
  if ((await (perm as any).requestPermission({ mode: 'read' })) !== 'granted') throw new Error('Aster needs permission to read this folder.');
  const h = await handleFor(key);
  if (!h) throw new Error('This subject folder was not found. Link your library again.');
  const tree = await scanFolder(h);
  await idb('trees', 'readwrite', (st) => st.put(tree, key));
  return tree;
}

// ---- reading a file -------------------------------------------------------------
export async function readFile(key: LibKey, path: string): Promise<File> {
  if (server) {
    const r = await fetch(serverFileUrl(subjectOfKey(key), path));
    if (r.status === 401) throw new Error('Your computer asks for the PIN again. Reload the page.');
    if (!r.ok) throw new Error('That file is not in the folder any more. Refresh the folder list.');
    const name = path.split('/').pop()!;
    return new File([await r.blob()], name, { type: mimeFor(name) || r.headers.get('content-type') || '' });
  }
  const perm = await permissionHandle(key);
  const root = await handleFor(key);
  if (!perm || !root) throw new Error('This folder is not linked any more. Link your library again.');
  if ((await (perm as any).requestPermission({ mode: 'read' })) !== 'granted') throw new Error('Aster needs permission to read this folder.');
  const parts = path.split('/');
  let dir = root;
  try {
    for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part);
    return await (await dir.getFileHandle(parts[parts.length - 1])).getFile();
  } catch {
    throw new Error('That file is not in the folder any more. Refresh the folder list.');
  }
}

// ---- file kinds -------------------------------------------------------------------
export const extOf = (name: string) => (name.includes('.') ? name.split('.').pop()!.toLowerCase() : '');
export type FileKind = 'pdf' | 'image' | 'text' | 'video' | 'audio' | 'other';
const VIDEO = ['mkv', 'mp4', 'm4v', 'mov', 'webm', 'avi', 'wmv', 'flv', 'mpg', 'mpeg'];
const AUDIO = ['mp3', 'm4a', 'wav', 'ogg', 'oga', 'flac', 'aac'];
export const kindOf = (name: string): FileKind => {
  const e = extOf(name);
  if (e === 'pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg'].includes(e)) return 'image';
  if (['txt', 'md', 'csv'].includes(e)) return 'text';
  if (VIDEO.includes(e)) return 'video';
  if (AUDIO.includes(e)) return 'audio';
  return 'other';
};
/** The type the browser should be told. Matroska (.mkv) is announced as WebM, which Chrome and Edge play when the codecs inside are supported. */
export const mimeFor = (name: string): string => {
  const e = extOf(name);
  if (e === 'mkv' || e === 'webm') return 'video/webm';
  if (['mp4', 'm4v', 'mov'].includes(e)) return 'video/mp4';
  if (e === 'mp3') return 'audio/mpeg';
  if (e === 'm4a' || e === 'aac') return 'audio/mp4';
  if (e === 'wav') return 'audio/wav';
  if (e === 'ogg' || e === 'oga') return 'audio/ogg';
  if (e === 'flac') return 'audio/flac';
  return '';
};
export const prettyName = (name: string) => (name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name);
export const prettySize = (n?: number) =>
  n === undefined ? '' : n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`;

export const countFiles = (n: FNode): number => (n.kind === 'file' ? 1 : (n.children ?? []).reduce((a, c) => a + countFiles(c), 0));
export const filesIn = (n: FNode): FNode[] => (n.kind === 'file' ? [n] : (n.children ?? []).flatMap(filesIn));
export const findNode = (root: FNode, path: string): FNode | null => {
  if (!path) return root;
  let cur: FNode | undefined = root;
  for (const part of path.split('/')) {
    cur = cur?.children?.find((c) => c.name === part);
    if (!cur) return null;
  }
  return cur;
};
