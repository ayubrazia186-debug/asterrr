// Aster desktop app. It runs the library server on this computer (so folders open with no permission prompts and every
// video format Chromium knows plays), and shows Aster in its own window. Other devices can use it too (Tablet access).
const { app, BrowserWindow, Menu, dialog, shell, clipboard, ipcMain } = require('electron');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const SERVER = path.join(__dirname, 'bundle', 'serve.mjs');
const DIST = path.join(__dirname, 'bundle', 'dist');
const settingsFile = () => path.join(app.getPath('userData'), 'desktop.json');
const readSettings = () => { try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch { return {}; } };
const writeSettings = (s) => { try { fs.writeFileSync(settingsFile(), JSON.stringify(s, null, 2)); } catch { /* read-only profile */ } };

let settings = {};
let child = null;
// the app brings its own ffmpeg, which turns .mkv videos into something phones can play
let FFMPEG_PATH = '';
try { const p = require('ffmpeg-static'); if (p && fs.existsSync(p)) FFMPEG_PATH = p; } catch { /* falls back to ffmpeg on the PATH */ }
let port = 0;
let win = null;

const freePort = (preferred) => new Promise((resolve) => {
  const s = net.createServer();
  s.once('error', () => { const t = net.createServer(); t.listen(0, '127.0.0.1', () => { const p = t.address().port; t.close(() => resolve(p)); }); });
  s.listen(preferred, '127.0.0.1', () => s.close(() => resolve(preferred)));
});

function waitForServer(p, ms = 15000) {
  const end = Date.now() + ms;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get({ host: '127.0.0.1', port: p, path: '/api/info', timeout: 1500 }, (res) => { res.resume(); resolve(); });
      req.on('error', () => { if (Date.now() > end) reject(new Error('The Aster server did not start.')); else setTimeout(tick, 250); });
      req.on('timeout', () => req.destroy());
    };
    tick();
  });
}

async function chooseFolder(parent) {
  const r = await dialog.showOpenDialog(parent ?? undefined, {
    title: 'Choose the folder that holds your subject folders (for example ZAINEMETICS CRASHCOURSE)',
    properties: ['openDirectory'],
    defaultPath: settings.root || app.getPath('documents'),
  });
  return r.canceled ? null : r.filePaths[0];
}

function stopServer() { if (child) { child.kill(); child = null; } }

async function startServer() {
  stopServer();
  port = await freePort(settings.port || 5174);
  const args = [SERVER, settings.root, '--port', String(port), '--pin', settings.pin, '--trust-local', '--host', settings.tablet ? '0.0.0.0' : '127.0.0.1'];
  child = spawn(process.execPath, args, {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ASTER_HOME: path.join(app.getPath('userData'), 'server'), ASTER_DIST: DIST, ...(FFMPEG_PATH ? { ASTER_FFMPEG: FFMPEG_PATH } : {}) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  child.on('exit', (code) => { if (child && code) dialog.showErrorBox('Aster stopped', `The built-in server stopped (code ${code}).\n\n${log.slice(-600)}`); child = null; });
  await waitForServer(port);
}

const lanAddresses = () => Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => `http://${i.address}:${port}`);

let tabletWin = null;
const tabletState = () => ({ on: !!settings.tablet, pin: settings.pin, urls: settings.tablet ? lanAddresses() : [] });
async function tabletDialog() {
  if (tabletWin) { tabletWin.focus(); return; }
  tabletWin = new BrowserWindow({
    width: 480, height: 520, parent: win ?? undefined, title: 'Tablet and phone access', backgroundColor: '#0F1728', autoHideMenuBar: true,
    minimizable: false, maximizable: false,
    webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'preload.cjs') },
  });
  tabletWin.removeMenu();
  tabletWin.on('closed', () => { tabletWin = null; });
  await tabletWin.loadFile(path.join(__dirname, 'tablet.html'));
}
ipcMain.handle('tablet:state', () => tabletState());
ipcMain.handle('tablet:toggle', async () => {
  settings.tablet = !settings.tablet; writeSettings(settings);
  await startServer();
  if (win) win.loadURL(`http://127.0.0.1:${port}/`);
  return tabletState();
});
ipcMain.on('tablet:copy', (_e, t) => clipboard.writeText(t));

async function changeFolder() {
  const f = await chooseFolder(win);
  if (!f) return;
  settings.root = f; writeSettings(settings);
  await startServer();
  if (win) win.loadURL(`http://127.0.0.1:${port}/`);
}

// ---- updates: checks GitHub Releases of your repository (only in the installed app, never in the portable one) ----
let updateState = 'idle', manualCheck = false;
function updaterReady() {
  return app.isPackaged && !process.env.PORTABLE_EXECUTABLE_FILE && fs.existsSync(path.join(process.resourcesPath, 'app-update.yml'));
}
function setupUpdater() {
  if (!updaterReady()) return null;
  let autoUpdater;
  try { ({ autoUpdater } = require('electron-updater')); } catch { return null; }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-available', (i) => { updateState = 'downloading'; if (manualCheck) dialog.showMessageBox({ message: `Aster ${i.version} is available`, detail: 'It is downloading now. You will be asked to restart when it is ready.' }); });
  autoUpdater.on('update-not-available', () => { updateState = 'idle'; if (manualCheck) dialog.showMessageBox({ message: 'You have the latest version of Aster.' }); manualCheck = false; });
  autoUpdater.on('error', (e) => { updateState = 'idle'; if (manualCheck) dialog.showErrorBox('Could not check for updates', String(e?.message || e)); manualCheck = false; });
  autoUpdater.on('update-downloaded', async (i) => {
    updateState = 'ready'; manualCheck = false;
    const r = await dialog.showMessageBox({ type: 'info', buttons: ['Restart now', 'Later'], defaultId: 0, cancelId: 1, message: `Aster ${i.version} is ready`, detail: 'Restart to finish updating. Your planner, notes and library are not touched. If you choose Later it installs the next time you close Aster.' });
    if (r.response === 0) { stopServer(); autoUpdater.quitAndInstall(); }
  });
  return autoUpdater;
}
let updater = null;
function checkForUpdates(manual) {
  if (!updater) {
    if (manual) dialog.showMessageBox({ message: 'Updates are only available in the installed version of Aster.', detail: 'The portable version and a build run with npm start do not update themselves. Install the Setup file to get updates.' });
    return;
  }
  if (updateState === 'downloading') { if (manual) dialog.showMessageBox({ message: 'An update is already downloading.' }); return; }
  manualCheck = !!manual;
  updater.checkForUpdates().catch(() => {});
}

function buildMenu() {
  const mac = process.platform === 'darwin';
  const tpl = [
    ...(mac ? [{ role: 'appMenu' }] : []),
    { label: 'Aster', submenu: [
      { label: 'Change library folder…', click: () => void changeFolder() },
      { label: 'Tablet and phone access…', click: () => void tabletDialog() },
      { label: 'Check for updates…', click: () => checkForUpdates(true) },
      { type: 'separator' },
      { label: 'Open library folder', click: () => settings.root && void shell.openPath(settings.root) },
      { type: 'separator' },
      mac ? { role: 'close' } : { role: 'quit' },
    ] },
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }, { type: 'separator' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }, { type: 'separator' }, { role: 'toggleDevTools' }] },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

async function createWindow() {
  const b = settings.bounds || { width: 1360, height: 880 };
  win = new BrowserWindow({
    ...b, minWidth: 900, minHeight: 600, backgroundColor: '#0F1728', title: 'Aster', icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: false },
  });
  win.on('close', () => { settings.bounds = win.getBounds(); writeSettings(settings); });
  win.on('closed', () => { win = null; });
  // links to other websites open in your browser; PDFs and pictures made by Aster open in a small window
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('blob:') || url.startsWith(`http://127.0.0.1:${port}`)) return { action: 'allow' };
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(`http://127.0.0.1:${port}`)) { e.preventDefault(); if (/^https?:/.test(url)) void shell.openExternal(url); } });
  await win.loadURL(`http://127.0.0.1:${port}/`);
}

const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(async () => {
    settings = readSettings();
    if (!settings.pin) settings.pin = String(crypto.randomInt(100000, 999999));
    // ASTER_ROOT lets tests and power users skip the folder question
    if (process.env.ASTER_ROOT) settings.root = process.env.ASTER_ROOT;
    if (!settings.root || !fs.existsSync(settings.root)) {
      const f = await chooseFolder(null);
      if (!f) { app.quit(); return; }
      settings.root = f;
    }
    writeSettings(settings);
    buildMenu();
    updater = setupUpdater();
    try { await startServer(); await createWindow(); if (updater) setTimeout(() => checkForUpdates(false), 8000); }
    catch (e) { dialog.showErrorBox('Aster could not start', String(e?.message || e)); app.quit(); }
  });
  app.on('window-all-closed', () => { stopServer(); app.quit(); });
  app.on('before-quit', stopServer);
  app.on('activate', () => { if (!win && port) void createWindow(); });
}
