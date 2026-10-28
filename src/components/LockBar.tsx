import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, Check, ImagePlus, Lock, LockOpen, ShieldAlert, X } from 'lucide-react';
import { useStore } from '../state/store';
import { SUBJECTS } from '../data/subjects';
import { behindOf, isDone, planClasses, todayOf } from '../lib/plan';
import { quota } from '../lib/quota';
import {
  EMERGENCY_PHRASE, allMet, cancelEmergency, dialogOpening, emergencyLeft, markProof, needs, noteRemaining, startEmergency, unlock, useLock,
} from '../lib/lock';
import { checkWork, preparePhoto, type Photo, type Verdict } from '../lib/proof';
import { isServer } from '../lib/folders';
import { cx, dayMonth, todayISO } from '../lib/dates';

/** Today's classes as text for the AI, and the late classes that come first. */
function useToday() {
  const { plan } = useStore();
  return useMemo(() => {
    const rows = SUBJECTS.flatMap((s) => todayOf(planClasses(plan[s.id])).map((c) => ({ s, c })));
    const late = SUBJECTS.flatMap((s) => behindOf(planClasses(plan[s.id])).filter((c) => !isDone(c)).map((c) => ({ s, c })));
    return {
      total: rows.length,
      done: rows.filter((r) => isDone(r.c)).length,
      late: late.length,
      lateLines: late.slice(0, 5).map((r) => `${r.s.name}: ${r.c.topic}${r.c.part ? ` (${r.c.part})` : ''}${r.c.date ? `, ${dayMonth(r.c.date)}` : ''}`),
      lines: rows.map((r) => `${r.s.name}: ${r.c.topic}${r.c.part ? ` (${r.c.part})` : ''}`),
    };
  }, [plan]);
}

export function LockBar() {
  const { ready, state, locked, desktop, tmFailed } = useLock();
  const today = useToday();
  const [open, setOpen] = useState(false);
  const [dlg, setDlg] = useState<null | 'proof' | 'emergency'>(null);
  const hasPlan = today.total > 0 || today.late > 0;
  useEffect(() => { if (locked && hasPlan) noteRemaining(today.late); }, [locked, hasPlan, today.late]);
  const q = quota(state.dayBase, todayISO(), today.late, today.done, today.total);
  // while late classes remain, ticking is not required (catching up is encouraged, not enforced); it returns once you reach today's work
  const n = { ...needs(state, q.done, q.owed), ...(q.kind === 'late' ? { tasks: null } : {}) };
  const met = allMet(n);
  const [freed, setFreed] = useState(false);

  // the lock lifts by itself the moment everything is done
  useEffect(() => {
    if (!ready || !locked || !met) return;
    void unlock('done').then((ok) => { if (ok) { setFreed(true); setDlg(null); setTimeout(() => setFreed(false), 6000); } });
  }, [ready, locked, met]);

  useEffect(() => {
    document.body.classList.toggle('is-locked', desktop && locked);
    return () => document.body.classList.remove('is-locked');
  }, [desktop, locked]);

  if (!desktop || !ready) return null;
  if (freed) return <div className="lockpill lockpill--free" role="status"><LockOpen size={16} /> Unlocked. Well done. Enjoy the rest of your day.</div>;
  if (!locked) return null;

  return (
    <>
      <div className={cx('lockpill', open && 'is-open')} data-testid="lockpill">
        <button type="button" className="lockpill__head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <Lock size={16} /> Locked until today's work is done
        </button>
        {open && (
          <div className="lockpill__body">
            <ul className="lockreq">
              {n.tasks && <li className={n.tasks[0] >= n.tasks[1] ? 'is-ok' : ''}><Check size={14} />Today's classes finished: <b>{n.tasks[0]} of {n.tasks[1]}</b></li>}
              {q.kind === 'late' && today.late > 0 && <li className="is-note"><Check size={14} />Late classes: <b>{today.late} left</b> (not required for now)</li>}
              {n.study && <li className={n.study[0] >= n.study[1] ? 'is-ok' : ''}><Check size={14} />Study time in Aster: <b>{n.study[0]} of {n.study[1]} min</b></li>}
              {n.proof !== null && <li className={n.proof ? 'is-ok' : ''}><Check size={14} />Photos of your work: <b>{n.proof ? 'approved' : 'not sent yet'}</b></li>}
            </ul>
            {tmFailed && state.cfg.blockTaskMgr && <p className="lockmsg lockmsg--bad" role="status">Windows refused to switch Task Manager off on this PC, so it can still be opened.</p>}
            {q.kind === 'late' && today.lateLines.length > 0 && <ul className="lockreq lockreq--late">{today.lateLines.map((l, i) => <li key={i}>{l}</li>)}{today.late > today.lateLines.length && <li>…and {today.late - today.lateLines.length} more</li>}</ul>}
            <div className="lockpill__acts">
              <Link to="/today" className="btn btn--sm btn--ghost" onClick={() => setOpen(false)}>Today's classes</Link>
              {n.proof !== null && !n.proof && <button type="button" className="btn btn--sm" onClick={() => setDlg('proof')}><Camera size={15} /> Send photos of my work</button>}
            </div>
            <button type="button" className="lockpill__link" onClick={() => setDlg('emergency')}>Emergency exit</button>
          </div>
        )}
      </div>
      {dlg === 'proof' && <ProofDialog tasks={today.lines} need={state.cfg.photos} onClose={() => setDlg(null)} />}
      {dlg === 'emergency' && <EmergencyDialog onClose={() => setDlg(null)} />}
    </>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="lockmodal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="lockmodal__card">
        <header><h2>{title}</h2><button type="button" className="iconbtn" onClick={onClose} aria-label="Close"><X size={18} /></button></header>
        {children}
      </div>
    </div>
  );
}

function ProofDialog({ tasks, need, onClose }: { tasks: string[]; need: number; onClose: () => void }) {
  const { state } = useLock();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [cam, setCam] = useState(false);
  const [tab, setTab] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const add = async (files: Blob[]) => {
    setMsg('');
    const out: Photo[] = [];
    for (const f of files) {
      try {
        const p = await preparePhoto(f);
        if (state.usedHashes.includes(p.hash)) { setMsg('One of those photos was already used on another day. Take new photos of today\'s work.'); continue; }
        if (photos.some((x) => x.hash === p.hash) || out.some((x) => x.hash === p.hash)) continue;
        out.push(p);
      } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not read that picture.'); }
    }
    setPhotos((cur) => [...cur, ...out].slice(0, 6));
    setVerdict(null);
  };

  const send = async () => {
    setBusy(true); setMsg(''); setVerdict(null);
    try {
      const v = await checkWork(photos, tasks);
      setVerdict(v);
      if (v.accepted) {
        if (photos.length < need) { setVerdict({ ...v, accepted: false, reason: `Good. But you need at least ${need} photos of your work. Add ${need - photos.length} more.` }); }
        else { markProof(photos.map((p) => p.hash)); setTimeout(onClose, 1200); }
      }
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not check the photos.'); }
    setBusy(false);
  };

  return (
    <Modal title="Send photos of today's work" onClose={onClose}>
      <ol className="lockhow">
        <li>Do your work by hand on paper and <b>write today's date ({dayMonth(todayISO())})</b> at the top of the page.</li>
        <li>Photograph it clearly. You need at least <b>{need}</b> photo{need === 1 ? '' : 's'} (up to 6).</li>
        <li>The AI checks them. It does not keep them.</li>
      </ol>
      <div className="lockshots">
        {photos.map((p) => (
          <figure key={p.id}><img src={p.url} alt="Your work" /><button type="button" onClick={() => setPhotos((c) => c.filter((x) => x.id !== p.id))} aria-label="Remove photo"><X size={13} /></button></figure>
        ))}
      </div>
      {tab && <TabletWait onPhotos={(b) => { void add(b); }} onClose={() => setTab(false)} />}
      {cam && <Camera2 onShot={(b) => { void add([b]); }} onClose={() => setCam(false)} />}
      <div className="lockpill__acts">
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { void add(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => { dialogOpening(); fileRef.current?.click(); }}><ImagePlus size={15} /> Add pictures</button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => { dialogOpening(); setCam((v) => !v); }}><Camera size={15} /> PC camera</button>
        {isServer() && <button type="button" className="btn btn--ghost btn--sm" onClick={() => setTab((v) => !v)}><Camera size={15} /> Tablet camera</button>}
        <button type="button" className="btn btn--sm" disabled={busy || photos.length === 0} onClick={() => void send()}>{busy ? 'Checking…' : 'Check my work'}</button>
      </div>
      {msg && <p className="lockmsg lockmsg--bad" role="alert">{msg}</p>}
      {verdict && <p className={cx('lockmsg', verdict.accepted ? 'lockmsg--ok' : 'lockmsg--bad')} role="status">{verdict.accepted ? 'Approved. ' : 'Not approved. '}{verdict.reason}</p>}
    </Modal>
  );
}

function TabletWait({ onPhotos, onClose }: { onPhotos: (b: Blob[]) => void; onClose: () => void }) {
  const [got, setGot] = useState(0);
  const [err, setErr] = useState('');
  const cb = useRef(onPhotos);
  cb.current = onPhotos;
  useEffect(() => {
    let stop = false;
    const poll = async () => {
      try {
        const r = await fetch('/api/inbox');
        if (!r.ok) throw new Error();
        const j = (await r.json()) as { photos: string[] };
        if (!stop && j.photos.length) {
          const blobs = await Promise.all(j.photos.map((u) => fetch(u).then((x) => x.blob())));
          setGot((n) => n + blobs.length); cb.current(blobs);
        }
        setErr('');
      } catch { if (!stop) setErr('Cannot reach the Aster server on this computer.'); }
    };
    void poll();
    const id = setInterval(() => void poll(), 2000);
    return () => { stop = true; clearInterval(id); };
  }, []);
  return (
    <div className="lockcam">
      <p className="lockmsg" role="status">Waiting for your tablet. On the tablet open Aster, then Settings, Devices, <b>Send photo to computer</b> (or go to <code>/#/camera</code> on the same address). Take the photos there.{got > 0 ? ` Received ${got}.` : ''}</p>
      {err && <p className="lockmsg lockmsg--bad">{err}</p>}
      <div className="lockpill__acts"><button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>Done</button></div>
    </div>
  );
}

function Camera2({ onShot, onClose }: { onShot: (b: Blob) => void; onClose: () => void }) {
  const vid = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'environment' } }).then((s) => {
      stream = s;
      if (vid.current) { vid.current.srcObject = s; void vid.current.play(); }
    }).catch(() => setErr('The camera is not available. Use "Add pictures" instead.'));
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);
  const snap = () => {
    const v = vid.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    c.toBlob((b) => b && onShot(b), 'image/jpeg', 0.9);
  };
  return (
    <div className="lockcam">
      {err ? <p className="lockmsg lockmsg--bad">{err}</p> : <video ref={vid} muted playsInline />}
      <div className="lockpill__acts"><button type="button" className="btn btn--sm" onClick={snap} disabled={!!err}>Take photo</button><button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>Done</button></div>
    </div>
  );
}

function useTick(ms = 1000) {
  const [, set] = useState(0);
  useEffect(() => { const id = setInterval(() => set((n) => n + 1), ms); return () => clearInterval(id); }, [ms]);
}

function EmergencyDialog({ onClose }: { onClose: () => void }) {
  const { state, waitMs } = useLock();
  useTick();
  const [typed, setTyped] = useState('');
  const [err, setErr] = useState('');
  const gap = emergencyLeft(state);
  const started = state.emergency.startedAt;
  const left = started ? Math.max(0, started + waitMs - Date.now()) : waitMs;
  const mins = Math.ceil(left / 60_000);
  const secs = Math.ceil(left / 1000);

  if (gap > 0) {
    const d = Math.ceil(gap / 86_400_000);
    return (
      <Modal title="Emergency exit" onClose={onClose}>
        <p>You already used the emergency exit this week. It comes back in about <b>{d} day{d === 1 ? '' : 's'}</b>.</p>
        <p>The way out today is to finish the work.</p>
      </Modal>
    );
  }
  return (
    <Modal title="Emergency exit" onClose={onClose}>
      <p><ShieldAlert size={16} style={{ verticalAlign: '-3px' }} /> The emergency exit unlocks the PC for today <b>without</b> the work. You can use it <b>once a week</b>, after a <b>{Math.round(waitMs / 60_000)}-minute wait</b>. Use it only if something is really wrong.</p>
      {!started ? (
        <>
          <p>To start the wait, type this sentence exactly:</p>
          <p className="lockphrase">{EMERGENCY_PHRASE}</p>
          <input className="lockinput" value={typed} onChange={(e) => { setTyped(e.target.value); setErr(''); }} aria-label="Type the sentence" autoComplete="off" spellCheck={false} onPaste={(e) => e.preventDefault()} />
          {err && <p className="lockmsg lockmsg--bad" role="alert">{err}</p>}
          <div className="lockpill__acts">
            <button type="button" className="btn btn--sm" onClick={() => { if (typed.trim() === EMERGENCY_PHRASE) startEmergency(); else setErr('It has to match exactly. You cannot paste it.'); }}>Start the wait</button>
          </div>
        </>
      ) : left > 0 ? (
        <>
          <p className="lockclock" role="timer">{mins > 1 ? `${mins} minutes left` : `${secs} seconds left`}</p>
          <p>You can keep studying while you wait. Closing Aster does not reset the wait.</p>
          <div className="lockpill__acts"><button type="button" className="btn btn--ghost btn--sm" onClick={() => { cancelEmergency(); onClose(); }}>Cancel the wait</button></div>
        </>
      ) : (
        <>
          <p>The wait is over. This uses your emergency exit for the next 7 days.</p>
          <div className="lockpill__acts">
            <button type="button" className="btn btn--sm" onClick={() => { void unlock('emergency').then((ok) => { if (!ok) setErr('The lock did not accept that. Try again.'); else onClose(); }); }}>Unlock for today</button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => { cancelEmergency(); onClose(); }}>Never mind</button>
          </div>
          {err && <p className="lockmsg lockmsg--bad" role="alert">{err}</p>}
        </>
      )}
    </Modal>
  );
}
