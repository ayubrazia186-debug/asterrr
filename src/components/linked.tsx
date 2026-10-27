// Shared pieces for every folder-based section: link the library once, keep access, refresh.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Copy, FolderOpen, FolderPlus, Loader2, RefreshCw, Search, Server, Unlink, X } from 'lucide-react';
import type { SubjectId } from '../types';
import { useStore } from '../state/store';
import { subjectMeta } from '../data/subjects';
import {
  accessState, countFiles, courseKey, folderAccessSupported, isServer, linkFolder, linkLibrary, loadLink, reconnect, rescan, unlinkFolder,
  type Access, type LinkedTree,
} from '../lib/folders';
import { reloadLibrary } from '../lib/useLibrary';
import { folderGuide } from '../lib/sections';
import { timeAgo } from '../lib/dates';

export function useLinkedFolder(subject: SubjectId) {
  const { notify } = useStore();
  const key = courseKey(subject);
  const [link, setLink] = useState<LinkedTree | null | undefined>(undefined);
  const [access, setAccess] = useState<Access>('missing');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setLink(await loadLink(key));
      setAccess(await accessState(key));
    } catch {
      setLink(null);
    }
  }, [key]);
  useEffect(() => { void load(); }, [load]);

  const fail = (e: unknown) => notify(e instanceof Error ? e.message : 'Something went wrong with that folder.', 'warn');

  return {
    link, access, busy,
    /** Link the library folder that holds every subject folder. */
    choose: async (): Promise<boolean> => {
      setBusy(true);
      try {
        const r = await linkLibrary();
        if (!r) return false;
        await load();
        await reloadLibrary();
        if (r.linked.includes(subject)) notify(`Linked ${r.rootName}: found ${r.linked.length} subject folder${r.linked.length === 1 ? '' : 's'}`);
        else notify(`Linked ${r.rootName}, but none of its folders has the code for ${subjectMeta(subject).name} (${subjectMeta(subject).code}) in its name.`, 'warn');
        return true;
      } catch (e) { fail(e); return false; } finally { setBusy(false); }
    },
    /** Link just this subject's folder, for people who do not keep everything under one folder. */
    chooseOne: async (): Promise<boolean> => {
      setBusy(true);
      try {
        const t = await linkFolder(key);
        if (!t) return false;
        setLink(t); setAccess('granted'); await reloadLibrary();
        notify(`Linked ${t.name}: ${t.count} items found`);
        return true;
      } catch (e) { fail(e); return false; } finally { setBusy(false); }
    },
    rescan: async () => {
      setBusy(true);
      try { const t = await rescan(key); setLink(t); setAccess('granted'); await reloadLibrary(); notify(`Updated: ${t.count} items`); } catch (e) { fail(e); } finally { setBusy(false); }
    },
    reconnect: async () => {
      try { setAccess((await reconnect(key)) ? 'granted' : 'needs-permission'); await reloadLibrary(); } catch (e) { fail(e); }
    },
    unlink: async (): Promise<boolean> => {
      if (!window.confirm('Unlink this subject folder from Aster? Your files are not touched.')) return false;
      await unlinkFolder(key);
      setLink(null); setAccess('missing'); await reloadLibrary();
      return true;
    },
  };
}
export type Linked = ReturnType<typeof useLinkedFolder>;

export function Loading({ children = 'Loading your folder' }: { children?: ReactNode }) {
  return <div className="lib__loading"><Loader2 size={18} className="spin" /> {children}</div>;
}

export function GuideTree({ subject }: { subject: SubjectId }) {
  const { notify } = useStore();
  const meta = subjectMeta(subject);
  const text = folderGuide(`SIR TEACHER ${meta.name.toUpperCase()} [${meta.code}]`, subject === 'accounting' ? 'numbered' : 'dotted');
  return (
    <div className="guide">
      <pre className="tree" aria-label="Recommended folder layout">{text}</pre>
      <button type="button" className="btn btn--sm btn--ghost" onClick={() => { void navigator.clipboard?.writeText(text).then(() => notify('Layout copied'), () => notify('Could not copy', 'warn')); }}><Copy size={14} />Copy</button>
    </div>
  );
}

/** Shown when a subject has no linked folder yet. */
export function LibraryCTA({ subject, f }: { subject: SubjectId; f: Linked }) {
  const meta = subjectMeta(subject);
  const supported = folderAccessSupported();
  if (isServer()) {
    return (
      <div className="lib-empty">
        <div className="lib-empty__art" aria-hidden="true"><Server size={36} strokeWidth={1.6} /></div>
        <h2>No folder for {meta.name} on your computer</h2>
        <p className="lede">Aster is reading your library from the computer that runs it. Put <strong>[{meta.code}]</strong> in the name of this subject's folder, inside your library folder, then press Refresh.</p>
        <GuideTree subject={subject} />
        <button type="button" className="btn" onClick={f.rescan} disabled={f.busy}>{f.busy ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}Refresh</button>
      </div>
    );
  }
  return (
    <div className="lib-empty">
      <div className="lib-empty__art" aria-hidden="true"><FolderPlus size={38} strokeWidth={1.6} /></div>
      <h2>Link your library</h2>
      <p className="lede">Choose the one folder that holds all your subject folders. Aster finds {meta.name} by <strong>[{meta.code}]</strong> in its folder name, and every other subject in the same step. Files stay on your computer. Aster only reads them.</p>
      <GuideTree subject={subject} />
      {supported ? (
        <div className="lib-empty__actions">
          <button type="button" className="btn" onClick={() => void f.choose()} disabled={f.busy}>
            {f.busy ? <Loader2 size={16} className="spin" /> : <FolderPlus size={16} />}Choose library folder
          </button>
          <button type="button" className="linkbtn" onClick={() => void f.chooseOne()} disabled={f.busy}>or link only the {meta.name} folder</button>
        </div>
      ) : (
        <p className="errtext">This browser cannot link folders. On a computer, use Chrome or Edge. On a tablet or phone, run the library server on your computer and open Aster from it (see Settings, Library).</p>
      )}
    </div>
  );
}

export function LinkBar({
  link, busy, query, setQuery, placeholder, onRescan, onChoose, onUnlink,
}: {
  link: LinkedTree; busy: boolean; query: string; setQuery: (v: string) => void; placeholder: string;
  onRescan: () => void; onChoose: () => void; onUnlink: () => void;
}) {
  const served = isServer();
  return (
    <div className="lib__bar">
      <div className="lib__where">
        {served ? <Server size={18} /> : <FolderOpen size={18} />}
        <strong>{link.name}</strong>
        <span className="muted">{countFiles(link.root)} files, checked {timeAgo(link.scannedAt)}{served ? ', from your computer' : ''}</span>
      </div>
      <label className="lib__search">
        <Search size={15} aria-hidden="true" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
        {query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')}><X size={14} /></button>}
      </label>
      <div className="lib__tools">
        <button type="button" className="btn btn--sm btn--ghost" onClick={onRescan} disabled={busy} title="Look for new files and folders">
          {busy ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}Refresh
        </button>
        {!served && <button type="button" className="btn btn--sm btn--ghost" onClick={onChoose} disabled={busy} title="Pick the library folder again">Change</button>}
        {!served && <button type="button" className="iconbtn" aria-label="Unlink folder" title="Unlink this subject" onClick={onUnlink}><Unlink size={15} /></button>}
      </div>
    </div>
  );
}

export function AccessNotice({ access, onAllow }: { access: Access; onAllow: () => void }) {
  if (access !== 'needs-permission') return null;
  return (
    <div className="notice notice--soft">
      <div>The browser asks you to re-allow access each time you reopen Aster. Your list is shown below, and files open once you allow it. (The library server removes this step.)</div>
      <button type="button" className="btn btn--sm" onClick={onAllow}>Allow access</button>
    </div>
  );
}

export function MissingFolder({ section, subject }: { section: 'topicals' | 'papers'; subject: SubjectId }) {
  const meta = subjectMeta(subject);
  const name = section === 'papers' ? 'Past papers' : 'Topicals';
  return (
    <div className="lib-empty">
      <div className="lib-empty__art" aria-hidden="true"><FolderPlus size={34} strokeWidth={1.6} /></div>
      <h2>Add a "{name}" folder</h2>
      <p className="lede">Inside your {meta.name} folder, make a folder called <strong>{name}</strong>. Put {section === 'papers' ? 'past papers and mark schemes' : 'topical questions'} in it, then press Refresh.</p>
      <GuideTree subject={subject} />
    </div>
  );
}
