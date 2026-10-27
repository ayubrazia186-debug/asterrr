// App theme: follow the device, or force light or dark. Remembered on this device.
export type Theme = 'auto' | 'light' | 'dark';
const KEY = 'aster.theme';
export const getTheme = (): Theme => { try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'auto'; } catch { return 'auto'; } };
export function applyTheme(t: Theme = getTheme()) {
  if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
}
export function setTheme(t: Theme) { try { localStorage.setItem(KEY, t); } catch { /* private mode */ } applyTheme(t); }
