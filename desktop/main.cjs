'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, session, Menu, Notification, powerSaveBlocker, nativeTheme } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const diskfs = require('./lib/diskfs.cjs');
const llama = require('./lib/llama.cjs');
const secrets = require('./lib/secrets.cjs');
const windowState = require('./lib/windowState.cjs');
const proto = require('./lib/protocol.cjs');

const isDev = !app.isPackaged;
// Multi-threaded WASM, WebGPU and big array buffers: Chromium switches the engine and the web app need.
app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer,WebAssemblyBaseline,WebAssemblyLiftoff');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=8192');
if (process.env.ATLAS_NO_SANDBOX) app.commandLine.appendSwitch('no-sandbox');
proto.registerSchemes();

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

let win = null;
let pendingOpen = process.argv.slice(isDev ? 2 : 1).filter((a) => /\.(gguf|txt|md|pdf|json)$/i.test(a) && fs.existsSync(a));

function webDir() {
  const packaged = path.join(process.resourcesPath || '', 'app-web');
  if (fs.existsSync(path.join(packaged, 'index.html'))) return packaged;
  return path.join(__dirname, '..', 'web', 'dist-desktop'); // dev: straight from the web build
}
function llamaDir() {
  if (process.env.ATLAS_LLAMA_DIR) return process.env.ATLAS_LLAMA_DIR; // tests: a stand-in engine
  const packaged = path.join(process.resourcesPath || '', 'llama');
  if (fs.existsSync(packaged)) return packaged;
  return path.join(__dirname, 'resources', 'llama');
}

/** A file Windows opened with Atlas (double click on a .gguf): made reachable, then handed to the app as a virtual path. */
function sendOpenFile(p) {
  try { diskfs.allow(p); win?.webContents.send('app:open-file', diskfs.virtualFor(p)); } catch { /* ignore */ }
}

function createWindow() {
  const ws = windowState(app.getPath('userData'));
  win = new BrowserWindow({
    ...ws.state,
    minWidth: 360, minHeight: 520,
    show: false,
    backgroundColor: '#0A0A0A',
    title: 'Atlas',
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false,
      backgroundThrottling: false, // generation and audio keep running when the window is hidden
    },
  });
  ws.track(win);
  if (ws.state.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.loadURL('app://atlas/index.html');
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) void shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://')) { e.preventDefault(); if (/^https?:/i.test(url)) void shell.openExternal(url); } });
  win.webContents.on('did-finish-load', () => { for (const p of pendingOpen.splice(0)) sendOpenFile(p); });
  win.on('closed', () => { win = null; });
  if (process.env.ATLAS_SELFTEST) require('./lib/selftest.cjs').run(win, app);
}

function setupSession() {
  const ses = session.defaultSession;
  // The app asks for the microphone (voice), camera (photos), location (maps) and notifications.
  ses.setPermissionRequestHandler((wc, permission, cb) => cb(['media', 'geolocation', 'notifications', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'midi', 'speaker-selection', 'display-capture', 'window-management'].includes(permission)));
  ses.setPermissionCheckHandler((wc, permission) => ['media', 'geolocation', 'notifications', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'midi'].includes(permission));
  ses.webRequest.onHeadersReceived((details, cb) => {
    const h = { ...details.responseHeaders };
    if (details.url.startsWith('app://')) {
      h['Content-Security-Policy'] = [[
        "default-src 'self' app: atlas-file: blob: data:",
        "script-src 'self' 'wasm-unsafe-eval' blob:",
        "worker-src 'self' blob:",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' atlas-file: blob: data: https:",
        "media-src 'self' atlas-file: blob: data: https:",
        "font-src 'self' data: blob:",
        "connect-src 'self' atlas-file: blob: data: http: https: ws: wss:",
        "frame-src 'self' atlas-file: blob:",
      ].join('; ')];
    }
    // The engine child process listens on loopback only; the page may call it whatever its build's CORS rules are.
    if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(details.url)) {
      for (const k of Object.keys(h)) if (/^access-control-allow-(origin|headers|methods)$/i.test(k)) delete h[k];
      h['Access-Control-Allow-Origin'] = ['*'];
      h['Access-Control-Allow-Headers'] = ['*'];
      h['Access-Control-Allow-Methods'] = ['GET, POST, OPTIONS'];
    }
    cb({ responseHeaders: h });
  });
}

function registerIpc() {
  const ops = diskfs.ops;
  for (const name of ['read', 'readRange', 'write', 'append', 'stat', 'exists', 'mkdir', 'readdir', 'unlink', 'move', 'copy', 'hash', 'writerOpen', 'writerWrite', 'writerClose', 'usage']) {
    // Errors travel as data so Electron does not log a stack for every ordinary ENOENT; preload re-throws them.
    ipcMain.handle(`fs:${name}`, async (_e, ...a) => {
      try { return await ops[name](...a); } catch (e) { return { __err: { message: String(e && e.message || e), code: e && e.code } }; }
    });
  }
  ipcMain.handle('dialog:pick', async (_e, req = {}) => {
    const exts = [];
    for (const a of req.accept || []) {
      if (a.startsWith('.')) exts.push(a.slice(1));
      else if (a === 'application/pdf') exts.push('pdf');
      else if (a === 'text/plain') exts.push('txt', 'md');
      else if (a === 'application/json') exts.push('json');
      else if (a === 'application/zip') exts.push('zip');
      else if (a === 'image/*') exts.push('png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp');
      else if (a === 'audio/*') exts.push('mp3', 'wav', 'm4a', 'ogg', 'flac');
      else if (a === 'video/*') exts.push('mp4', 'mov', 'webm', 'mkv');
    }
    const r = await dialog.showOpenDialog(win, {
      properties: [req.directory ? 'openDirectory' : 'openFile', ...(req.multiple ? ['multiSelections'] : [])],
      filters: exts.length ? [{ name: 'Files', extensions: [...new Set(exts)] }, { name: 'All files', extensions: ['*'] }] : undefined,
    });
    if (r.canceled || !r.filePaths.length) return null;
    const out = [];
    for (const p of r.filePaths) {
      diskfs.allow(p);
      let size = 0;
      try { size = fs.statSync(p).size; } catch { /* folder */ }
      out.push({ path: diskfs.virtualFor(p), name: path.basename(p), size, type: null });
    }
    return out;
  });
  ipcMain.handle('dialog:save', async (_e, { path: src, fileName }) => {
    const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('documents'), fileName) });
    if (r.canceled || !r.filePath) return null;
    fs.copyFileSync(diskfs.real(src), r.filePath);
    return diskfs.virtualFor(r.filePath);
  });
  ipcMain.handle('shell:showItem', (_e, p) => { try { shell.showItemInFolder(diskfs.real(p)); } catch { /* ignore */ } });
  ipcMain.handle('shell:openExternal', (_e, url) => { if (/^(https?|mailto|tel):/i.test(url)) return shell.openExternal(url); });
  ipcMain.handle('secrets:get', (_e, k) => secrets.get(k));
  ipcMain.handle('secrets:set', (_e, k, v) => secrets.set(k, v));
  ipcMain.handle('secrets:remove', (_e, k) => secrets.remove(k));
  ipcMain.handle('llama:capabilities', () => llama.capabilities());
  ipcMain.handle('llama:start', (_e, o) => {
    // Model and projector paths come in as virtual paths: resolve them to real files for the engine process.
    const resolved = { ...o, model: diskfs.real(o.model), ...(o.mmproj ? { mmproj: diskfs.real(o.mmproj) } : {}) };
    return llama.start(resolved);
  });
  ipcMain.handle('llama:stop', (_e, id) => llama.stop(id));
  ipcMain.handle('system:info', () => llama.systemInfo());
  let blocker = null;
  ipcMain.handle('power:block', (_e, on) => {
    if (on && blocker == null) blocker = powerSaveBlocker.start('prevent-display-sleep');
    else if (!on && blocker != null) { powerSaveBlocker.stop(blocker); blocker = null; }
  });
  ipcMain.handle('notify', (_e, title, body) => { if (Notification.isSupported()) new Notification({ title, body, icon: path.join(__dirname, 'build', 'icon.png') }).show(); });
  ipcMain.handle('win:minimize', () => win?.minimize());
  ipcMain.handle('win:maximize', () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()));
  ipcMain.handle('win:close', () => win?.close());
  ipcMain.handle('win:titlebar', () => undefined);
  ipcMain.handle('update:check', async () => checkForUpdates());
  ipcMain.handle('update:install', () => { try { require('electron-updater').autoUpdater.quitAndInstall(); } catch { /* not packaged */ } });
}

async function checkForUpdates() {
  if (isDev) return { available: false };
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = true;
    autoUpdater.on('update-downloaded', (info) => win?.webContents.send('app:update-ready', info.version));
    const r = await autoUpdater.checkForUpdates();
    return { available: !!r?.updateInfo, version: r?.updateInfo?.version };
  } catch (e) { return { available: false, error: String(e.message || e) }; }
}

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Atlas', submenu: [{ role: 'reload' }, { role: 'forceReload' }, { type: 'separator' }, { role: 'togglefullscreen' }, { role: 'toggleDevTools', accelerator: 'F12' }, { type: 'separator' }, { role: 'quit' }] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }] },
    { label: 'Help', submenu: [{ label: 'Open the data folder', click: () => shell.openPath(diskfs.getRoot()) }, { label: 'Atlas on GitHub', click: () => shell.openExternal('https://github.com/coolchan03/Atlas') }] },
  ]));
}

app.on('second-instance', (_e, argv) => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  for (const a of argv.slice(1)) if (/\.(gguf|txt|md|pdf|json)$/i.test(a) && fs.existsSync(a)) sendOpenFile(a);
});
app.on('open-file', (e, p) => { e.preventDefault(); if (win) sendOpenFile(p); else pendingOpen.push(p); });

app.whenReady().then(async () => {
  nativeTheme.themeSource = 'dark';
  const data = app.getPath('userData');
  diskfs.init(path.join(data, 'data'));
  secrets.init(data);
  llama.init(llamaDir(), (id, pct) => win?.webContents.send('llama:progress', id, pct));
  proto.registerHandlers(webDir());
  setupSession();
  registerIpc();
  buildMenu();
  createWindow();
  if (!isDev) setTimeout(() => void checkForUpdates(), 15000);
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { llama.stopAll(); if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => llama.stopAll());
