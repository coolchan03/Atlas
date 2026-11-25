'use strict';
// Exposes the desktop capabilities to the web app as window.atlasHost. The web app checks for this object;
// when it is absent (plain browser) it uses browser APIs instead.
const { contextBridge, ipcRenderer } = require('electron');

const inv = async (ch, ...a) => {
  const r = await ipcRenderer.invoke(ch, ...a);
  if (r && typeof r === 'object' && r.__err) throw Object.assign(new Error(r.__err.message), { code: r.__err.code });
  return r;
};
const listeners = new Map();
ipcRenderer.on('llama:progress', (_e, id, pct) => { for (const cb of listeners.get('llama:progress') || []) cb(id, pct); });
// Files opened before the page has registered a listener (a double click that launched the app) are kept and delivered later.
const waitingOpen = [];
ipcRenderer.on('app:open-file', (_e, p) => {
  const cbs = listeners.get('app:open-file');
  if (cbs && cbs.size) for (const cb of cbs) cb(p); else waitingOpen.push(p);
});
const on = (ev, cb) => {
  if (!listeners.has(ev)) listeners.set(ev, new Set());
  listeners.get(ev).add(cb);
  return () => listeners.get(ev).delete(cb);
};

contextBridge.exposeInMainWorld('atlasHost', {
  kind: 'electron',
  platform: process.platform,
  versions: { electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node },
  fsRaw: {
    read: (p) => inv('fs:read', p), readRange: (p, pos, len) => inv('fs:readRange', p, pos, len), write: (p, d) => inv('fs:write', p, d),
    append: (p, d) => inv('fs:append', p, d), stat: (p) => inv('fs:stat', p), exists: (p) => inv('fs:exists', p), mkdir: (p) => inv('fs:mkdir', p),
    readdir: (p) => inv('fs:readdir', p), unlink: (p) => inv('fs:unlink', p), move: (a, b) => inv('fs:move', a, b), copy: (a, b) => inv('fs:copy', a, b),
    hash: (p, algo) => inv('fs:hash', p, algo), writerOpen: (p, keep) => inv('fs:writerOpen', p, keep), writerWrite: (id, c) => inv('fs:writerWrite', id, c),
    writerClose: (id) => inv('fs:writerClose', id), usage: () => inv('fs:usage'),
    fileUrl: (p) => 'atlas-file://local' + encodeURI(p.startsWith('/') ? p : '/' + p),
  },
  pickFiles: (req) => inv('dialog:pick', req),
  saveFile: (req) => inv('dialog:save', req),
  showItemInFolder: (p) => inv('shell:showItem', p),
  openExternal: (url) => inv('shell:openExternal', url),
  secrets: { get: (k) => inv('secrets:get', k), set: (k, v) => inv('secrets:set', k, v), remove: (k) => inv('secrets:remove', k) },
  llama: {
    capabilities: () => inv('llama:capabilities'), start: (o) => inv('llama:start', o), stop: (id) => inv('llama:stop', id),
    onProgress: (cb) => on('llama:progress', cb),
  },
  system: () => inv('system:info'),
  powerSaveBlocker: (on_) => inv('power:block', on_),
  notify: (title, body) => inv('notify', title, body),
  onOpenFile: (cb) => { const off = on('app:open-file', cb); for (const p of waitingOpen.splice(0)) cb(p); return off; },
  window: { minimize: () => inv('win:minimize'), toggleMaximize: () => inv('win:maximize'), close: () => inv('win:close'), setTitleBar: (c) => inv('win:titlebar', c) },
  update: { check: () => inv('update:check'), install: () => inv('update:install') },
});
