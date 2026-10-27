// Focus Lock, desktop side. When the lock is on and today's work is not done, Aster takes over the whole screen, stays in
// front of other windows, and cannot be closed from the window. The web app (src/lib/lock.ts) decides when the work is
// done and tells this file to let go. This is a promise device, not security: Task Manager, Ctrl+Alt+Del, safe mode or
// editing desktop.json can always get around it, and this file does not try to stop that.
const { app, ipcMain, Menu, session } = require('electron');

const DEFAULT_CFG = { enabled: false, minutes: 120, needTasks: true, needProof: true, photos: 2 };
const GAP = 7 * 24 * 3600_000;
const WAIT = Number(process.env.ASTER_LOCK_TEST_WAIT_MS) || 30 * 60_000;
const pad = (n) => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

function createLock(ctx) {
  let state = null;
  let sessionLocked = false;
  let keeper = null;
  let suppressUntil = 0;

  const blank = () => ({ cfg: { ...DEFAULT_CFG }, pending: null, unlockedDay: null, study: {}, proofDay: null, usedHashes: [], emergency: { startedAt: null, lastUsed: null } });
  const persist = () => { const s = ctx.settings(); s.lock = state; ctx.save(); };

  function load() {
    state = { ...blank(), ...(ctx.settings().lock || {}) };
    state.cfg = { ...DEFAULT_CFG, ...state.cfg };
    state.emergency = { startedAt: null, lastUsed: null, ...(state.emergency || {}) };
    if (state.pending && Date.now() >= state.pending.at) { state.cfg = { ...DEFAULT_CFG, ...state.pending.cfg }; state.pending = null; }
    sessionLocked = !!state.cfg.enabled && state.unlockedDay !== today();
    persist();
    loginItem();
  }

  function loginItem() {
    // start with Windows when the lock is on, so it is there from the first second
    if (!app.isPackaged) return;
    try { app.setLoginItemSettings({ openAtLogin: !!state.cfg.enabled }); } catch { /* not supported here */ }
  }

  function enforce() {
    const win = ctx.win();
    if (!win || win.isDestroyed()) return;
    if (sessionLocked) {
      win.setClosable(false); win.setMinimizable(false); win.setSkipTaskbar(true);
      win.setKiosk(true); win.setAlwaysOnTop(true, 'screen-saver'); win.setMenuBarVisibility(false);
      Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'editMenu' }]));
      win.show(); win.focus();
      if (!keeper) keeper = setInterval(keep, 1200);
    } else {
      if (keeper) { clearInterval(keeper); keeper = null; }
      win.setKiosk(false); win.setAlwaysOnTop(false); win.setClosable(true); win.setMinimizable(true); win.setSkipTaskbar(false);
      win.setMenuBarVisibility(true);
      ctx.menu();
      win.setFullScreen(false);
    }
  }

  function keep() {
    const win = ctx.win();
    if (!sessionLocked || !win || win.isDestroyed()) return;
    if (Date.now() < suppressUntil) return;
    if (!win.isVisible()) win.show();
    if (win.isMinimized()) win.restore();
    if (!win.isKiosk()) win.setKiosk(true);
    if (!win.isFocused()) { win.setAlwaysOnTop(true, 'screen-saver'); win.moveTop(); win.focus(); }
  }

  const gapOk = () => !state.emergency.lastUsed || Date.now() - state.emergency.lastUsed >= GAP;

  function register() {
    ipcMain.handle('lock:load', () => ({ state, sessionLocked, desktop: true, emergencyWaitMs: WAIT }));
    ipcMain.handle('lock:save', (_e, inc) => {
      if (!inc || typeof inc !== 'object') return;
      if (!sessionLocked) {
        if (inc.cfg) state.cfg = { ...DEFAULT_CFG, ...inc.cfg };
        state.pending = inc.pending ?? null;
      }
      if (inc.study && typeof inc.study === 'object') for (const [d, ms] of Object.entries(inc.study)) state.study[d] = Math.max(state.study[d] || 0, Number(ms) || 0);
      if (typeof inc.proofDay === 'string' || inc.proofDay === null) state.proofDay = inc.proofDay;
      if (Array.isArray(inc.usedHashes)) state.usedHashes = inc.usedHashes.filter((h) => typeof h === 'string').slice(-600);
      // the wait for the emergency exit is timed here, not in the web page
      const want = inc.emergency?.startedAt;
      if (want && !state.emergency.startedAt && gapOk()) state.emergency.startedAt = Date.now();
      if (!want) state.emergency.startedAt = null;
      persist(); loginItem();
    });
    ipcMain.handle('lock:unlock', (_e, reason) => {
      if (!sessionLocked) return true;
      if (reason === 'emergency') {
        const e = state.emergency;
        if (!e.startedAt || Date.now() - e.startedAt < WAIT - 2000 || !gapOk()) return false;
        e.lastUsed = Date.now(); e.startedAt = null;
      } else if (reason !== 'done') return false;
      state.unlockedDay = today(); sessionLocked = false;
      persist(); enforce();
      return true;
    });
    // the page is about to open a file chooser or the camera prompt: do not pull focus away from it
    ipcMain.on('lock:dialog', () => { suppressUntil = Date.now() + 90_000; });

    session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(perm === 'media' && /^http:\/\/127\.0\.0\.1:/.test(wc.getURL())));
    session.defaultSession.setPermissionCheckHandler((wc, perm) => perm === 'media' && !!wc && /^http:\/\/127\.0\.0\.1:/.test(wc.getURL()));
  }

  // keys that would let you out of the window while it is locked
  const blocks = (i) => {
    if (i.type !== 'keyDown') return false;
    const k = (i.key || '').toLowerCase();
    if (k === 'f12' || k === 'f11') return true;
    if (i.alt && k === 'f4') return true;
    if (i.control && ['w', 'q'].includes(k)) return true;
    if (i.control && i.shift && ['i', 'j', 'c', 'q', 'w'].includes(k)) return true;
    return false;
  };

  return {
    init() { load(); register(); },
    enforce, blocks,
    isLocked: () => sessionLocked,
    keepFocus: keep,
  };
}

module.exports = { createLock };
