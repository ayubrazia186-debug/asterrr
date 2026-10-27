// Remembers how far you got in each video, on this device only.
const KEY = 'aster.resume.v1';
type Map_ = Record<string, number>;
const read = (): Map_ => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Map_; } catch { return {}; } };
export const getResume = (id: string): number => read()[id] ?? 0;
export function setResume(id: string, seconds: number) {
  try {
    const m = read();
    if (seconds < 5) delete m[id]; else m[id] = Math.round(seconds);
    const keys = Object.keys(m);
    if (keys.length > 400) for (const k of keys.slice(0, keys.length - 400)) delete m[k];
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch { /* storage unavailable: resume is a convenience only */ }
}
