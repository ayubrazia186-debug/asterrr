import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Check, CloudOff, Loader2, Play, RefreshCw } from 'lucide-react';
import { useStore } from '../state/store';
import { cx, timeAgo } from '../lib/dates';
import { extOf, kindOf } from '../lib/folders';
import { STEP_NAMES } from '../data/subjects';
import type { Steps } from '../types';

/** A hand-drawn style tick that draws itself when switched on. */
export function PenTick({ size = 18 }: { size?: number }) {
  return (
    <svg className="pentick" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d="M4.5 12.8 9.6 18 19.8 6.2" pathLength={1} />
    </svg>
  );
}

export function StepBoxes({
  steps, color, onToggle, compact = false,
}: { steps: Steps; color: string; onToggle: (i: number) => void; compact?: boolean }) {
  return (
    <div className={cx('steps', compact && 'steps--compact')} style={{ ['--accent' as string]: color }}>
      {STEP_NAMES.map((name, i) => (
        <button
          key={name}
          type="button"
          className={cx('step', steps[i] && 'is-on')}
          aria-pressed={steps[i]}
          aria-label={`${name}: ${steps[i] ? 'done' : 'not done'}`}
          onClick={() => onToggle(i)}
        >
          <span className="step__box">{steps[i] && <PenTick size={compact ? 15 : 18} />}</span>
          <span className="step__label">{name === 'Questions' ? 'Qs' : name}</span>
        </button>
      ))}
    </div>
  );
}

export function Bar({ value, color, height = 6 }: { value: number; color: string; height?: number }) {
  return (
    <span className="bar" style={{ height, ['--accent' as string]: color }} role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </span>
  );
}

export function Segmented<T extends string>({
  options, value, onChange, label,
}: { options: Array<{ value: T; label: string; count?: number }>; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className={cx('seg__btn', o.value === value && 'is-on')} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
          {o.count !== undefined && <span className="seg__count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function SyncChip({ full = false }: { full?: boolean }) {
  const { syncState, pendingCount, lastSync, syncNow } = useStore();
  let icon: ReactNode;
  let text: string;
  let tone: string;
  if (syncState === 'off') { icon = <CloudOff size={15} />; text = pendingCount ? `${pendingCount} saved on this device` : 'Sheets not connected'; tone = 'off'; }
  else if (syncState === 'syncing') { icon = <Loader2 size={15} className="spin" />; text = 'Syncing'; tone = 'busy'; }
  else if (syncState === 'error') { icon = <AlertTriangle size={15} />; text = pendingCount ? `Offline, ${pendingCount} waiting` : 'Sync problem'; tone = 'err'; }
  else if (pendingCount) { icon = <RefreshCw size={15} />; text = `Saving ${pendingCount}`; tone = 'busy'; }
  else { icon = <Check size={15} />; text = full ? `Synced ${timeAgo(lastSync)}` : 'Synced'; tone = 'ok'; }
  const inner = (<><span className={cx('sync__dot', `sync__dot--${tone}`)} />{icon}<span>{text}</span></>);
  return syncState === 'off' || syncState === 'error' ? (
    <Link to="/settings" className="sync" title="Open sync settings">{inner}</Link>
  ) : (
    <button type="button" className="sync" onClick={() => void syncNow()} title="Sync now">{inner}</button>
  );
}

export function Toast() {
  const { toast } = useStore();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { /* live region only */ }, [toast]);
  return (
    <div ref={ref} className="toast-region" aria-live="polite">
      {toast && <div key={toast.id} className={cx('toast', toast.tone === 'warn' && 'toast--warn')}>{toast.text}</div>}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}

/** Small label for a file's type. Videos and audio get a play mark. */
export function ExtBadge({ name }: { name: string }) {
  const e = extOf(name);
  const k = kindOf(name);
  return (
    <span className={cx('ext', `ext--${k}`)}>
      {k === 'video' || k === 'audio' ? <Play size={10} fill="currentColor" strokeWidth={0} aria-hidden="true" /> : null}
      {e ? e.slice(0, 4) : 'file'}
    </span>
  );
}
