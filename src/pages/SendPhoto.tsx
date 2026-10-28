import { useRef, useState } from 'react';
import { Camera, Check } from 'lucide-react';
import { isServer } from '../lib/folders';
import { preparePhoto } from '../lib/proof';

/** Opened on a tablet or phone: takes a photo and sends it to the computer's Focus Lock window. */
export function SendPhoto() {
  const ref = useRef<HTMLInputElement>(null);
  const [sent, setSent] = useState(0);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true); setMsg('');
    try {
      for (const f of Array.from(files)) {
        const p = await preparePhoto(f);
        const r = await fetch('/api/inbox', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: p.url }) });
        if (!r.ok) throw new Error(r.status === 401 ? 'Type the PIN first (open the Aster home page on this device).' : 'The computer did not accept the photo.');
        setSent((n) => n + 1);
      }
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not send the photo.'); }
    setBusy(false);
  };
  return (
    <div className="page page--narrow">
      <header className="pagehead"><div><h1>Send photo to computer</h1></div></header>
      {!isServer() ? <p className="lede">Open Aster on this device from your computer&rsquo;s address (see the desktop app: Aster, Tablet and phone access), then come back here.</p> : (
        <section className="panel">
          <p className="lede lede--tight">Write today&rsquo;s date on your page, take a photo, and it appears in the Focus Lock window on your computer. Send as many as it asks for.</p>
          <input ref={ref} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void pick(e.target.files); e.target.value = ''; }} />
          <div className="form__actions">
            <button type="button" className="btn" disabled={busy} onClick={() => ref.current?.click()}><Camera size={16} /> {busy ? 'Sending…' : 'Take a photo'}</button>
          </div>
          {sent > 0 && <p className="oktext" role="status"><Check size={14} /> {sent} photo{sent === 1 ? '' : 's'} sent to the computer.</p>}
          {msg && <p className="errtext" role="alert">{msg}</p>}
        </section>
      )}
    </div>
  );
}
