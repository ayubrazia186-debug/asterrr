// Extra controls under the video: volume and voice boost, picture-in-picture, fit or fill, brightness, bookmarks, 10 s jumps.
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Bookmark as Mark, Expand, Minimize2, PictureInPicture2, RotateCcw, RotateCw, Shrink, Sun, Volume2, Mic, X, Theater } from 'lucide-react';
import { getBookmarks, saveBookmarks, setViewerPrefs, useViewerPrefs, type Bookmark } from '../lib/viewerPrefs';
import { cx } from '../lib/dates';

export const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Quality label from the real picture size. Local files have one quality; this shows which one it is. */
export function qualityLabel(h: number): string {
  if (!h) return '';
  if (h >= 2000) return `4K ${h}p`;
  if (h >= 1000) return `Full HD ${h}p`;
  if (h >= 700) return `HD ${h}p`;
  return `SD ${h}p`;
}

interface Graph { ctx: AudioContext; gain: GainNode; eq: BiquadFilterNode; level: DynamicsCompressorNode; mid: GainNode; voice: boolean }

/** A soft clipper. Levels up to 60% pass through unchanged; above that the peaks are rounded off towards full scale instead
 *  of being cut flat, and nothing can go past it. A WaveShaper reads its curve over -1..1, so the signal is first scaled by
 *  1/4 and the curve describes -4..4. */
function softClip(ctx: AudioContext): { input: AudioNode; output: AudioNode } {
  const n = 4097;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = ((i / (n - 1)) * 2 - 1) * 4;
    const a = Math.abs(x);
    curve[i] = Math.sign(x) * (a < 0.6 ? a : 0.6 + 0.4 * Math.tanh((a - 0.6) / 0.4));
  }
  const pre = ctx.createGain(); pre.gain.value = 0.25;
  const w = ctx.createWaveShaper();
  w.curve = curve; w.oversample = '2x';
  pre.connect(w);
  return { input: pre, output: w };
}

/** Makes the sound louder than the 100% a browser allows, and optionally lifts the speaking voice. */
export function useAudioBoost(el: RefObject<HTMLMediaElement | null>, boost: number, voice: boolean, src: string | undefined) {
  const g = useRef<Graph | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  useEffect(() => {
    const m = el.current;
    if (!m || !src) return;
    const need = boost > 1 || voice;
    if (!g.current) {
      if (!need) return;
      try {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctx();
        const node = ctx.createMediaElementSource(m);
        const eq = ctx.createBiquadFilter(); eq.type = 'peaking'; eq.frequency.value = 2800; eq.Q.value = 0.9;
        const level = ctx.createDynamicsCompressor();   // evens out quiet and loud speech (voice boost only)
        const gain = ctx.createGain();
        const last = ctx.createGain(); last.gain.value = 0.98;
        const clip = softClip(ctx);
        const mid = ctx.createGain();
        node.connect(eq); eq.connect(mid); mid.connect(gain); gain.connect(clip.input); clip.output.connect(last); last.connect(ctx.destination);
        level.connect(mid);
        g.current = { ctx, gain, eq, level, mid, voice: false };
      } catch { setUnsupported(true); return; }
    }
    const n = g.current;
    n.gain.gain.value = boost;
    n.eq.gain.value = voice ? 6 : 0;
    // the leveller (which adds its own make-up gain) is only in the path while voice boost is on
    if (voice !== n.voice) {
      n.eq.disconnect();
      if (voice) n.eq.connect(n.level); else n.eq.connect(n.mid);
      n.voice = voice;
    }
    n.level.threshold.value = -32; n.level.ratio.value = 3; n.level.knee.value = 20;
    void n.ctx.resume().catch(() => undefined);
  }, [el, boost, voice, src]);
  useEffect(() => () => { void g.current?.ctx.close().catch(() => undefined); g.current = null; }, []);
  return unsupported;
}

export function VideoBar({ vid, rid, audio, unsupported, theater, onTheater, res }: {
  vid: RefObject<HTMLVideoElement | null>; rid: string; audio: boolean; unsupported: boolean; theater: boolean; onTheater: () => void; res: string;
}) {
  const p = useViewerPrefs();
  const [marks, setMarks] = useState<Bookmark[]>(() => getBookmarks(rid));
  const [bright, setBright] = useState(false);
  const [now, setNow] = useState(0);
  const pip = !audio && typeof document !== 'undefined' && document.pictureInPictureEnabled;

  useEffect(() => setMarks(getBookmarks(rid)), [rid]);
  useEffect(() => {
    const m = vid.current;
    if (!m) return;
    const f = () => setNow(m.currentTime);
    m.addEventListener('timeupdate', f);
    return () => m.removeEventListener('timeupdate', f);
  }, [vid]);

  const seek = (t: number) => { const m = vid.current; if (m) m.currentTime = Math.max(0, Math.min(m.duration || t, t)); };
  const skip = (d: number) => { const m = vid.current; if (m) seek(m.currentTime + d); };
  const addMark = () => {
    const m = vid.current;
    if (!m) return;
    const t = Math.floor(m.currentTime);
    if (marks.some((b) => Math.abs(b.t - t) < 2)) return;
    const next = [...marks, { t, label: clock(t) }].sort((a, b) => a.t - b.t);
    setMarks(next); saveBookmarks(rid, next);
  };
  const delMark = (t: number) => { const next = marks.filter((b) => b.t !== t); setMarks(next); saveBookmarks(rid, next); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT|IFRAME)$/.test(t.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'b') addMark();
      else if (e.key === 't') onTheater();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  return (
    <div className="vbar">
      <div className="vbar__row" role="toolbar" aria-label="Video tools">
        <button type="button" className="iconbtn iconbtn--sm" onClick={() => skip(-10)} aria-label="Back 10 seconds" title="Back 10 s (J)"><RotateCcw size={15} /></button>
        <button type="button" className="iconbtn iconbtn--sm" onClick={() => skip(10)} aria-label="Forward 10 seconds" title="Forward 10 s (L)"><RotateCw size={15} /></button>
        <span className="vbar__sep" />
        <label className="vbar__sel" title="Sound boost: louder than the normal maximum">
          <Volume2 size={14} aria-hidden="true" />
          <select value={p.vBoost} aria-label="Volume boost" onChange={(e) => setViewerPrefs({ vBoost: Number(e.target.value) })} disabled={unsupported}>
            {[1, 1.5, 2, 3].map((v) => <option key={v} value={v}>{v === 1 ? 'Normal' : `Boost ${Math.round(v * 100)}%`}</option>)}
          </select>
        </label>
        <button type="button" className={cx('chipbtn', p.voice && 'is-on')} aria-pressed={p.voice} disabled={unsupported} onClick={() => setViewerPrefs({ voice: !p.voice })} title="Lifts the frequencies of a speaking voice and evens out loud and quiet parts"><Mic size={13} />Voice boost</button>
        {!audio && (
          <>
            <span className="vbar__sep" />
            <button type="button" className="iconbtn iconbtn--sm" onClick={() => setViewerPrefs({ vFit: p.vFit === 'contain' ? 'cover' : 'contain' })} aria-label={p.vFit === 'contain' ? 'Fill the frame' : 'Fit the whole picture'} title={p.vFit === 'contain' ? 'Fill the frame (crops edges)' : 'Fit the whole picture'}>{p.vFit === 'contain' ? <Expand size={15} /> : <Shrink size={15} />}</button>
            <button type="button" className={cx('iconbtn iconbtn--sm', bright && 'is-on')} onClick={() => setBright(!bright)} aria-label="Picture brightness" aria-pressed={bright}><Sun size={15} /></button>
            {bright && <input className="vbar__range" type="range" min={0.6} max={1.5} step={0.05} value={p.vBright} aria-label="Picture brightness" onChange={(e) => setViewerPrefs({ vBright: Number(e.target.value) })} />}
            {pip && <button type="button" className="iconbtn iconbtn--sm" aria-label="Picture in picture" title="Keep the video floating while you read" onClick={() => { const m = vid.current; if (!m) return; if (document.pictureInPictureElement) void document.exitPictureInPicture(); else void m.requestPictureInPicture().catch(() => undefined); }}><PictureInPicture2 size={15} /></button>}
            <button type="button" className={cx('iconbtn iconbtn--sm', theater && 'is-on')} onClick={onTheater} aria-label={theater ? 'Leave theater mode' : 'Theater mode'} aria-pressed={theater} title="Theater mode (T)">{theater ? <Minimize2 size={15} /> : <Theater size={15} />}</button>
          </>
        )}
        <span className="vbar__sep" />
        <button type="button" className="chipbtn" onClick={addMark} title="Save this moment (B)"><Mark size={13} />Bookmark {clock(now)}</button>
        {res && <span className="vbar__res" title="The recording's real picture size. A single local file has one quality; Aster cannot switch between SD and HD.">{res}</span>}
      </div>
      {unsupported && <p className="muted vbar__note">This browser does not allow sound boost for this file.</p>}
      {(p.vBoost > 1 || p.voice) && !unsupported && <p className="muted vbar__note">Boosted sound can be very loud. Lower your device volume first, especially with headphones.</p>}
      {marks.length > 0 && (
        <ul className="vmarks" aria-label="Bookmarks">
          {marks.map((b) => (
            <li key={b.t}>
              <button type="button" className="chipbtn" onClick={() => seek(b.t)}>{b.label}</button>
              <button type="button" className="vmarks__x" aria-label={`Delete bookmark ${b.label}`} onClick={() => delMark(b.t)}><X size={11} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
