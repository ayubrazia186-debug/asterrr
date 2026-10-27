// Runs before the app: checks whether Aster is being served by the library server (tablet / phone) and asks for its PIN.
import { useEffect, useState, type ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { detectServer, loginServer } from '../lib/folders';
import { reloadLibrary } from '../lib/useLibrary';

export function Boot({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<'check' | 'pin' | 'ready'>('check');
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void detectServer().then((s) => { if (live) setPhase(s && s.needsPin && !s.authed ? 'pin' : 'ready'); });
    return () => { live = false; };
  }, []);

  if (phase === 'ready') return <>{children}</>;
  if (phase === 'check') return <div className="boot" aria-busy="true"><span className="boot__dot" /></div>;
  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr('');
    const m = await loginServer(pin.trim()).catch(() => 'Could not reach your computer.');
    setBusy(false);
    if (m) { setErr(m); return; }
    await reloadLibrary();
    setPhase('ready');
  };
  return (
    <form className="boot boot--pin" onSubmit={(e) => void go(e)}>
      <span className="boot__lock"><Lock size={22} /></span>
      <h1>Aster</h1>
      <p className="muted">Enter the PIN shown on your computer.</p>
      <input className="input boot__input" inputMode="numeric" autoComplete="one-time-code" autoFocus value={pin} onChange={(e) => setPin(e.target.value)} aria-label="PIN" />
      {err && <p className="errtext" role="alert">{err}</p>}
      <button type="submit" className="btn" disabled={busy || !pin.trim()}>Open</button>
    </form>
  );
}
