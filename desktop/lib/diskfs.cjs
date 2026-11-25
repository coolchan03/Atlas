'use strict';
// Real-disk file system behind the renderer's virtual paths. "/atlas/files/x" lives under
// <userData>/data/atlas/files/x. Paths a person picked in a dialog ("/C:/Users/me/doc.pdf") are real
// absolute paths and are only reachable once a dialog (or the app itself) has allowed them.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

let root = '';
const allowed = new Set();
const writers = new Map();
let writerSeq = 1;

function init(dataRoot) {
  root = dataRoot;
  fs.mkdirSync(root, { recursive: true });
}
const norm = (p) => {
  const parts = [];
  for (const seg of String(p).replace(/^file:\/\//, '').replace(/\\/g, '/').split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return '/' + parts.join('/');
};
const DRIVE = /^\/([A-Za-z]):(\/.*)?$/;
function real(virtual) {
  const p = norm(virtual);
  const m = DRIVE.exec(p);
  if (m) {
    const abs = path.win32.normalize(`${m[1]}:${m[2] || '\\'}`);
    if (!isAllowed(abs)) throw Object.assign(new Error(`Access to ${abs} has not been granted`), { code: 'EACCES' });
    return abs;
  }
  // POSIX absolute paths from a dialog (macOS / Linux dev runs) are treated the same way.
  if (path.isAbsolute(virtual) && !p.startsWith('/atlas') && allowedHas(p)) return p;
  return path.join(root, ...p.split('/').filter(Boolean));
}
const allowedHas = (p) => [...allowed].some((a) => p === a || p.startsWith(a.endsWith(path.sep) || a.endsWith('/') ? a : a + path.sep) || p.startsWith(a + '/'));
const isAllowed = (abs) => [...allowed].some((a) => abs === a || abs.toLowerCase().startsWith(a.toLowerCase().replace(/[\\/]*$/, '') + path.win32.sep));
function allow(absPath) {
  allowed.add(absPath);
  allowed.add(path.dirname(absPath));
}
/** Virtual path for a real path (what the renderer should use). */
function virtualFor(absPath) {
  const rel = path.relative(root, absPath);
  if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) return '/' + rel.split(path.sep).join('/');
  return '/' + absPath.replace(/\\/g, '/').replace(/^\//, '');
}

const toStat = (virtual, name, st) => ({
  path: norm(virtual), name, size: st.isFile() ? st.size : 0, isFile: st.isFile(), isDirectory: st.isDirectory(),
  mtime: Math.round(st.mtimeMs), ctime: Math.round(st.ctimeMs),
});
const enoent = (p, e) => Object.assign(new Error(`ENOENT: no such file or directory, open '${p}'`), { code: 'ENOENT', cause: e });

async function wrap(p, fn) {
  try { return await fn(); } catch (e) { if (e && e.code === 'ENOENT') throw enoent(p, e); throw e; }
}

const ops = {
  read: (p) => wrap(p, async () => new Uint8Array(await fsp.readFile(real(p)))),
  readRange: (p, pos, len) => wrap(p, async () => {
    const fh = await fsp.open(real(p), 'r');
    try {
      const buf = Buffer.alloc(len);
      const { bytesRead } = await fh.read(buf, 0, len, pos);
      return new Uint8Array(buf.subarray(0, bytesRead));
    } finally { await fh.close(); }
  }),
  write: async (p, data) => { const r = real(p); await fsp.mkdir(path.dirname(r), { recursive: true }); await fsp.writeFile(r, typeof data === 'string' ? data : Buffer.from(data)); },
  append: async (p, data) => { const r = real(p); await fsp.mkdir(path.dirname(r), { recursive: true }); await fsp.appendFile(r, typeof data === 'string' ? data : Buffer.from(data)); },
  stat: (p) => wrap(p, async () => toStat(p, path.basename(real(p)), await fsp.stat(real(p)))),
  exists: async (p) => { try { await fsp.access(real(p)); return true; } catch { return false; } },
  mkdir: async (p) => { await fsp.mkdir(real(p), { recursive: true }); },
  readdir: (p) => wrap(p, async () => {
    const r = real(p);
    const out = [];
    for (const e of await fsp.readdir(r, { withFileTypes: true })) {
      try { out.push(toStat(norm(p) + (norm(p) === '/' ? '' : '/') + e.name, e.name, await fsp.stat(path.join(r, e.name)))); } catch { /* vanished */ }
    }
    return out;
  }),
  unlink: async (p) => { await fsp.rm(real(p), { recursive: true, force: true }); },
  move: async (a, b) => {
    const from = real(a), to = real(b);
    await fsp.mkdir(path.dirname(to), { recursive: true });
    try { await fsp.rename(from, to); } catch (e) {
      if (e.code === 'EXDEV') { await fsp.cp(from, to, { recursive: true }); await fsp.rm(from, { recursive: true, force: true }); } else throw e;
    }
  },
  copy: async (a, b) => { const to = real(b); await fsp.mkdir(path.dirname(to), { recursive: true }); await fsp.cp(real(a), to, { recursive: true }); },
  hash: (p, algo) => wrap(p, () => new Promise((resolve, reject) => {
    const h = crypto.createHash(algo === 'sha1' ? 'sha1' : algo === 'sha512' ? 'sha512' : algo === 'sha384' ? 'sha384' : algo === 'md5' ? 'md5' : 'sha256');
    fs.createReadStream(real(p)).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  })),
  writerOpen: async (p, keep) => {
    const r = real(p);
    await fsp.mkdir(path.dirname(r), { recursive: true });
    const fh = await fsp.open(r, keep ? 'a' : 'w');
    const id = writerSeq++;
    writers.set(id, fh);
    return id;
  },
  writerWrite: async (id, chunk) => { await writers.get(id).write(Buffer.from(chunk)); },
  writerClose: async (id) => { const fh = writers.get(id); writers.delete(id); await fh?.close(); },
  usage: async () => {
    try {
      const s = await fsp.statfs(root);
      const free = Number(s.bavail) * Number(s.bsize);
      const total = Number(s.blocks) * Number(s.bsize);
      return { used: total - free, quota: total };
    } catch { return { used: 0, quota: 0 }; }
  },
};

module.exports = { init, ops, real, norm, allow, virtualFor, getRoot: () => root };
