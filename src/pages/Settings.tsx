import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Download, ExternalLink, FolderOpen, Loader2, Plus, RefreshCw, Sparkles, Trash2, Upload } from 'lucide-react';
import { SUBJECTS } from '../data/subjects';
import { folderAccessSupported, isServer, linkLibrary, serverInfo, unlinkFolder, courseKey } from '../lib/folders';
import { reloadLibrary, useLibrary } from '../lib/useLibrary';
import { useStore } from '../state/store';
import { Segmented, SyncChip } from '../components/ui';
import { getTheme, setTheme, type Theme } from '../lib/theme';
import { timeAgo } from '../lib/dates';
import { AiError, coolingOf, listGeminiModels, listModels, newKeyId, PROVIDER_NAME, ping, saveAi, useAi, type AiKey, type ModelInfo, type Provider } from '../lib/ai';
import { cx } from '../lib/dates';
import { keysShared, setKeysShared, useSharedStatus } from '../lib/shared';
import { DEFAULT_CFG, cancelPending, requestCfg, useLock, type LockCfg } from '../lib/lock';

function AiSettingsPanel() {
  const ai = useAi();
  const { notify } = useStore();
  const [orModels, setOrModels] = useState<ModelInfo[]>([]);
  const [gemModels, setGemModels] = useState<ModelInfo[]>([]);
  const [freeOnly, setFreeOnly] = useState(false);
  const [busy, setBusy] = useState('');
  const [results, setResults] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [temp, setTemp] = useState(String(ai.temperature));
  const [, tick] = useState(0);
  const firstGem = ai.keys.find((k) => k.provider === 'gemini' && k.key.trim());

  const setKeys = (keys: AiKey[]) => saveAi({ keys });
  const patch = (id: string, p: Partial<AiKey>) => setKeys(ai.keys.map((k) => (k.id === id ? { ...k, ...p } : k)));
  const add = (provider: Provider) => {
    const n = ai.keys.filter((k) => k.provider === provider).length + 1;
    setKeys([...ai.keys, { id: newKeyId(), label: `${PROVIDER_NAME[provider]} ${n}`, provider, key: '', on: true }]);
  };
  const remove = (id: string) => { if (window.confirm('Remove this key from this browser?')) setKeys(ai.keys.filter((k) => k.id !== id)); };
  const move = (id: string, d: number) => {
    const i = ai.keys.findIndex((k) => k.id === id); const j = i + d;
    if (i < 0 || j < 0 || j >= ai.keys.length) return;
    const next = [...ai.keys]; [next[i], next[j]] = [next[j], next[i]]; setKeys(next);
  };
  const test = async (k: AiKey) => {
    setBusy(k.id); setResults((r) => ({ ...r, [k.id]: { ok: true, text: 'Testing…' } }));
    try { const text = await ping(k, ai); setResults((r) => ({ ...r, [k.id]: { ok: true, text } })); }
    catch (e) { setResults((r) => ({ ...r, [k.id]: { ok: false, text: e instanceof AiError ? e.message : 'The test failed.' } })); }
    finally { setBusy(''); tick((n) => n + 1); }
  };
  const loadOr = async () => {
    setBusy('or');
    try { setOrModels(await listModels()); } catch (e) { notify(e instanceof AiError ? e.message : 'Could not load the OpenRouter model list. You can still type a model name.', 'warn'); } finally { setBusy(''); }
  };
  const loadGem = async () => {
    if (!firstGem) { notify('Add a Google AI Studio key first.', 'warn'); return; }
    setBusy('gem');
    try { setGemModels(await listGeminiModels(firstGem.key.trim())); } catch (e) { notify(e instanceof AiError ? e.message : 'Could not load the Gemini model list.', 'warn'); } finally { setBusy(''); }
  };
  const t = Math.min(2, Math.max(0, Number(temp) || 0));
  const shownOr = orModels.filter((m) => !freeOnly || m.free);

  return (
    <section className="panel">
      <h2 className="panel__title"><Sparkles size={17} /> AI tutor</h2>
      <p className="lede lede--tight">
        Add keys from <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio<ExternalLink size={12} /></a> and/or <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer">OpenRouter<ExternalLink size={12} /></a>. Add as many as you like, for example one per Google account. When a key runs out of free quota or is refused, Aster moves to the next one by itself. Keys are saved only in this browser, are sent only to their own provider, and are not in backups, the sheet sync or the code.
      </p>
      <ul className="keys">
        {ai.keys.map((k, i) => {
          const c = coolingOf(k.id);
          const r = results[k.id];
          return (
            <li key={k.id} className={cx('keyrow', !k.on && 'is-off')}>
              <div className="keyrow__top">
                <input className="input input--short" value={k.label} onChange={(e) => patch(k.id, { label: e.target.value })} aria-label="Key name" />
                <select className="input input--short" value={k.provider} onChange={(e) => patch(k.id, { provider: e.target.value as Provider })} aria-label="Provider">
                  <option value="gemini">Google AI Studio</option><option value="openrouter">OpenRouter</option>
                </select>
                <label className="check"><input type="checkbox" checked={k.on} onChange={(e) => patch(k.id, { on: e.target.checked })} />On</label>
                <button type="button" className="iconbtn iconbtn--sm" aria-label="Move up" disabled={i === 0} onClick={() => move(k.id, -1)}><ArrowUp size={14} /></button>
                <button type="button" className="iconbtn iconbtn--sm" aria-label="Move down" disabled={i === ai.keys.length - 1} onClick={() => move(k.id, 1)}><ArrowDown size={14} /></button>
                <button type="button" className="iconbtn iconbtn--sm" aria-label={`Remove ${k.label}`} onClick={() => remove(k.id)}><Trash2 size={14} /></button>
              </div>
              <div className="keyrow__top">
                <input className="input" type="password" value={k.key} onChange={(e) => patch(k.id, { key: e.target.value.trim() })} placeholder={k.provider === 'gemini' ? 'AIza…' : 'sk-or-v1-…'} spellCheck={false} autoComplete="off" aria-label={`${k.label} key`} />
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => void test(k)} disabled={busy !== '' || !k.key.trim()}>{busy === k.id ? <Loader2 size={14} className="spin" /> : null}Test</button>
              </div>
              {c && <p className="muted keyrow__note">Resting for a bit: {c.why}</p>}
              {r && <p className={r.ok ? 'oktext' : 'errtext'} role="status">{r.text}</p>}
            </li>
          );
        })}
      </ul>
      <div className="form__actions form__actions--tight">
        <button type="button" className="btn btn--sm" onClick={() => add('gemini')}><Plus size={14} />Add Google AI Studio key</button>
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => add('openrouter')}><Plus size={14} />Add OpenRouter key</button>
      </div>
      <p className="muted">Google counts the free quota <strong>per Google Cloud project</strong>, not per key, so two keys from the same account share one quota. Keys from different Google accounts each have their own.</p>

      <label className="field"><span className="field__label">Which key first?</span>
        <select className="input input--short" value={ai.strategy} onChange={(e) => saveAi({ strategy: e.target.value as 'first' | 'rotate' })}>
          <option value="first">Top key first, next only if it fails</option>
          <option value="rotate">Take turns between keys</option>
        </select>
      </label>

      <label className="field"><span className="field__label">Google model</span>
        <input className="input" list="gem-models" value={ai.geminiModel} onChange={(e) => saveAi({ geminiModel: e.target.value.trim() })} placeholder="gemini-flash-latest" spellCheck={false} autoComplete="off" />
      </label>
      <datalist id="gem-models">{gemModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</datalist>
      <div className="form__actions form__actions--tight">
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => void loadGem()} disabled={busy !== ''}>{busy === 'gem' ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}Load Google models</button>
        <span className="muted">If the name stops working, Aster looks up a current Flash model for your key and remembers it.</span>
      </div>

      <label className="field"><span className="field__label">OpenRouter model</span>
        <input className="input" list="or-models" value={ai.model} onChange={(e) => saveAi({ model: e.target.value.trim() })} placeholder="openrouter/auto" spellCheck={false} autoComplete="off" />
      </label>
      <datalist id="or-models">{shownOr.slice(0, 600).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</datalist>
      <div className="form__actions form__actions--tight">
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => void loadOr()} disabled={busy !== ''}>{busy === 'or' ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}Load OpenRouter models</button>
        {orModels.length > 0 && <label className="check"><input type="checkbox" checked={freeOnly} onChange={(e) => setFreeOnly(e.target.checked)} />Free only ({orModels.filter((m) => m.free).length})</label>}
      </div>

      <label className="field"><span className="field__label">Temperature (0 = the same answer each time, up to 2 = more varied)</span>
        <input className="input input--short" type="number" min={0} max={2} step={0.1} value={temp} onChange={(e) => { setTemp(e.target.value); saveAi({ temperature: Math.min(2, Math.max(0, Number(e.target.value) || 0)) }); }} />
      </label>
      <p className="muted">Current: {t}. A model can still word an answer differently even at 0. Some newer Gemini models are tuned for their default temperature; if answers loop or look odd, try 1. openrouter/auto may cost credit; models ending in :free do not.</p>
    </section>
  );
}

function FocusLockPanel() {
  const { state, locked, desktop, tmFailed } = useLock();
  const [draft, setDraft] = useState<LockCfg>(state.cfg);
  const [note, setNote] = useState('');
  const set = (p: Partial<LockCfg>) => { setDraft((d) => ({ ...d, ...p })); setNote(''); };
  const left = state.pending ? Math.max(0, state.pending.at - Date.now()) : 0;
  const hours = Math.ceil(left / 3600_000);
  const apply = () => {
    const r = requestCfg(draft);
    setNote(r === 'blocked' ? 'Finish today\'s work first. The lock settings cannot change while the PC is locked.'
      : r === 'waiting' ? 'Saved. Stricter parts apply now. The looser parts (or turning it off) apply in 24 hours.' : 'Saved.');
  };
  return (
    <section className="panel">
      <h2 className="panel__title">Focus Lock</h2>
      {!desktop ? (
        <p className="lede lede--tight">Focus Lock works in the Aster desktop app on your computer. Install the Setup file and open it there.</p>
      ) : (
        <>
          <p className="lede lede--tight">Every time the computer starts, Aster takes over the screen until today's work is done. It cannot lock Windows itself, so it keeps Aster in front of everything. Closing it with Task Manager is still possible; the lock is a promise you make to yourself.</p>
          <label className="check"><input type="checkbox" checked={draft.enabled} disabled={locked} onChange={(e) => set({ enabled: e.target.checked })} /> Lock the computer every time it starts</label>
          <div className="form">
            <label className="field"><span>Study time in Aster (minutes)</span>
              <input type="number" min={0} max={600} step={5} value={draft.minutes} disabled={locked} onChange={(e) => set({ minutes: Math.max(0, Math.min(600, Number(e.target.value) || 0)) })} /></label>
            <label className="field"><span>Photos of your work to send</span>
              <input type="number" min={1} max={6} value={draft.photos} disabled={locked} onChange={(e) => set({ photos: Math.max(1, Math.min(6, Number(e.target.value) || 1)) })} /></label>
          </div>
          <label className="check"><input type="checkbox" checked={draft.needTasks} disabled={locked} onChange={(e) => set({ needTasks: e.target.checked })} /> Planner classes must be finished (late classes first, then today's)</label>
          <label className="check"><input type="checkbox" checked={draft.needProof} disabled={locked} onChange={(e) => set({ needProof: e.target.checked })} /> The AI must approve photos of my handwritten work</label>
          <label className="check"><input type="checkbox" checked={draft.blockTaskMgr} disabled={locked} onChange={(e) => set({ blockTaskMgr: e.target.checked })} /> Also switch Task Manager off while locked</label>
          {tmFailed && locked && <p className="errtext" role="alert">Windows refused to switch Task Manager off on this PC (access denied), so it can still be opened. Another tool or a PC rule may be protecting that setting. This does not stop the rest of the lock.</p>}
          <p className="muted">This uses a Windows setting for your account only. It is switched back on when the lock lifts and whenever Aster starts unlocked. If Aster is ever killed while locked and Task Manager stays grey, open Command Prompt (Windows key + R, type cmd) and run: reg delete HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\System /v DisableTaskMgr /f</p>
          <p className="muted">Photos are read by your AI key (Settings, AI) and are not kept. Write today's date on the page.</p>
          <div className="form__actions">
            <button type="button" className="btn" disabled={locked || JSON.stringify(draft) === JSON.stringify(state.cfg)} onClick={apply}>Save lock settings</button>
            <button type="button" className="btn btn--ghost" disabled={locked} onClick={() => { setDraft(DEFAULT_CFG); setNote(''); }}>Standard settings</button>
          </div>
          <p className="muted">Fair rule: making the lock stricter works straight away. Making it looser, or turning it off, takes 24 hours, so you cannot do it on a bad evening.</p>
          {state.pending && <p className="notice notice--soft">A looser setting is waiting and starts in about {hours} hour{hours === 1 ? '' : 's'}. <button type="button" className="linkbtn" disabled={locked} onClick={cancelPending}>Cancel it</button></p>}
          {locked && <p className="errtext">The computer is locked right now, so these settings cannot be changed. Finish today's work first.</p>}
          {note && <p className="muted" role="status">{note}</p>}
        </>
      )}
    </section>
  );
}

function SharedPanel() {
  const sh = useSharedStatus();
  const [keys, setKeys] = useState(keysShared());
  return (
    <section className="panel">
      <h2 className="panel__title"><RefreshCw size={17} /> Your devices</h2>
      <p className="lede lede--tight">Flashcards, done-marks, written notes, paper scores and topic moves are kept the same on every device that opens Aster from your computer. A change made on one shows up on the others within about 20 seconds.</p>
      <p className={sh.status === 'error' ? 'errtext' : 'muted'} role="status">
        {sh.status === 'ok' ? `Up to date (${timeAgo(sh.at ? new Date(sh.at).toISOString() : null)})` : sh.status === 'syncing' ? 'Syncing…' : sh.status === 'error' ? sh.error : 'Starting…'}
      </p>
      <label className="check"><input type="checkbox" checked={keys} onChange={(e) => { setKeysShared(e.target.checked); setKeys(e.target.checked); }} />Also share my AI keys between my devices</label>
      <p className="muted">Keys are then stored as plain text in the <code>.aster-data</code> folder on your computer, so only turn this on if nobody else uses that computer or knows the PIN. Off by default: you add keys on each device yourself.</p>
    </section>
  );
}

function LibraryPanel() {
  const lib = useLibrary();
  const { notify } = useStore();
  const [busy, setBusy] = useState(false);
  const server = isServer();
  const info = serverInfo();
  const choose = async () => {
    setBusy(true);
    try {
      const r = await linkLibrary();
      if (r) { await reloadLibrary(); notify(`Linked ${r.rootName}: ${r.linked.length} subject folder${r.linked.length === 1 ? '' : 's'} found`); }
    } catch (e) { notify(e instanceof Error ? e.message : 'Could not link that folder.', 'warn'); } finally { setBusy(false); }
  };
  const unlinkAll = async () => {
    if (!window.confirm('Unlink every subject folder from Aster? Your files are not touched.')) return;
    for (const s of SUBJECTS) await unlinkFolder(courseKey(s.id));
    await reloadLibrary();
  };
  return (
    <section className="panel">
      <h2 className="panel__title"><FolderOpen size={17} /> Course library</h2>
      {server ? (
        <>
          <p className="lede lede--tight">Aster is reading your folders from your computer ({info?.root}). Nothing to link on this device.{info && !info.ffmpeg ? ' ffmpeg is not installed on the computer, so .mkv videos will not play on an iPad or iPhone.' : ''}</p>
        </>
      ) : folderAccessSupported() ? (
        <p className="lede lede--tight">Pick the one folder that holds all your subject folders (for example ZAINEMETICS CRASHCOURSE). Aster finds each subject by the code in its name, like [0450]. Files are only read, never changed or uploaded.</p>
      ) : (
        <p className="lede lede--tight">This browser cannot open folders. On a tablet or phone, run Aster from your computer (see the README, “Tablet”).</p>
      )}
      {typeof navigator !== 'undefined' && navigator.userAgent.includes('AsterApp') && (
        <div className="form__actions form__actions--tight">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => { window.location.href = 'http://localhost/?change=1'; }}>Change computer address</button>
        </div>
      )}
      <ul className="libstat">
        {SUBJECTS.map((s) => {
          const t = lib.trees[s.id];
          return <li key={s.id}><span className="navdot" style={{ ['--accent' as string]: s.color }} /><strong>{s.name}</strong><span className="muted">{t ? `${t.name}: ${t.count} items${lib.access[s.id] === 'needs-permission' ? ' (needs permission)' : ''}` : 'not linked'}</span></li>;
        })}
      </ul>
      {!server && folderAccessSupported() && (
        <div className="form__actions">
          <button type="button" className="btn" onClick={() => void choose()} disabled={busy}>{busy ? <Loader2 size={15} className="spin" /> : <FolderOpen size={15} />}Choose library folder</button>
          <button type="button" className="btn btn--ghost" onClick={() => void unlinkAll()} disabled={!Object.keys(lib.trees).length}>Unlink all</button>
        </div>
      )}
    </section>
  );
}

export function Settings() {
  const { settings, updateSettings, syncNow, syncState, syncError, lastSync, pendingCount, exportBackup, importBackup, resetLocal, notify } = useStore();
  const [url, setUrl] = useState(settings.syncUrl);
  const [token, setToken] = useState(settings.syncToken);
  const fileRef = useRef<HTMLInputElement>(null);
  const [theme, setThemeState] = useState<Theme>(getTheme());
  const dirty = url.trim() !== settings.syncUrl || token.trim() !== settings.syncToken;

  const save = () => {
    const u = url.trim();
    if (u && !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(u) && !/^http:\/\/(127\.0\.0\.1|localhost):\d+\//.test(u)) {
      notify('That does not look like a Web app URL. It should start with https://script.google.com/macros/s/ and end with /exec', 'warn');
      return;
    }
    updateSettings({ syncUrl: u, syncToken: token.trim() });
    notify(u ? 'Saved. Connecting to your sheets' : 'Disconnected from the sheets');
  };

  const download = () => {
    const blob = new Blob([exportBackup()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `aster-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const restore = async (file?: File) => {
    if (!file) return;
    const ok = importBackup(await file.text());
    notify(ok ? 'Backup restored' : 'That file is not an Aster backup', ok ? 'ok' : 'warn');
  };

  return (
    <div className="page page--narrow">
      <header className="pagehead"><div><h1>Settings</h1></div></header>

      <section className="panel">
        <h2 className="panel__title">You</h2>
        <label className="field"><span className="field__label">Your name</span>
          <input className="input" value={settings.name} onChange={(e) => updateSettings({ name: e.target.value })} placeholder="Shown in the greeting" />
        </label>
        <div className="field"><span className="field__label">Appearance</span>
          <Segmented<Theme> label="Appearance" value={theme} onChange={(t) => { setTheme(t); setThemeState(t); }} options={[{ value: 'auto', label: 'Match device' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
        </div>
      </section>

      <section className="panel">
        <h2 className="panel__title">Google Sheets sync</h2>
        <p className="lede lede--tight">
          Ticks and class notes you change here are written to your four Google Sheets. Changes you make in the sheets show up here within about a minute. Setup takes about five minutes and is in <code>sync/SETUP.md</code>.
        </p>
        <label className="field"><span className="field__label">Web app URL</span>
          <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/.../exec" spellCheck={false} autoComplete="off" />
        </label>
        <label className="field"><span className="field__label">Access code</span>
          <input className="input" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="The TOKEN you set in the script" spellCheck={false} autoComplete="off" />
        </label>
        <div className="form__actions">
          <button type="button" className="btn" onClick={save} disabled={!dirty}>Save and connect</button>
          <button type="button" className="btn btn--ghost" onClick={() => void syncNow()} disabled={syncState === 'off' || dirty}><RefreshCw size={15} />Sync now</button>
          <SyncChip full />
        </div>
        <dl className="facts">
          <div><dt>Last sync</dt><dd>{timeAgo(lastSync)}</dd></div>
          <div><dt>Waiting to send</dt><dd>{pendingCount}</dd></div>
        </dl>
        {syncState === 'error' && <p className="errtext" role="alert">{syncError}</p>}
      </section>

      <LibraryPanel />

      {isServer() && <SharedPanel />}

      <AiSettingsPanel />

      <FocusLockPanel />

      <section className="panel">
        <h2 className="panel__title">Backup</h2>
        <p className="lede lede--tight">Flashcards, papers, notes, done-marks and web links live only on this device. Download a backup now and then. Linked folders are not included, so link them again on a new browser.</p>
        <div className="form__actions">
          <button type="button" className="btn" onClick={download}><Download size={15} />Download backup</button>
          <button type="button" className="btn btn--ghost" onClick={() => fileRef.current?.click()}><Upload size={15} />Restore backup</button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => { void restore(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        <div className="danger">
          <button type="button" className="btn btn--danger" onClick={() => { if (window.confirm('Reset this device to the original snapshot? Unsent ticks, notes, papers and links on this device will be lost.')) resetLocal(); }}>Reset this device</button>
          <span className="muted">Your Google Sheets are not touched.</span>
        </div>
      </section>
    </div>
  );
}
