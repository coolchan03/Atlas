'use strict';
// app://atlas/*  serves the bundled web build from disk with the headers the web app needs
//                (COOP/COEP => SharedArrayBuffer for multi-threaded WASM).
// atlas-file://local/<virtual path>  streams a file from the data folder (or an allowed path), with Range
//                support, so images / audio / PDF / video load without being copied into memory.
const { protocol } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const diskfs = require('./diskfs.cjs');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.ttf': 'font/ttf',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.onnx': 'application/octet-stream',
};
const mimeFor = (f) => MIME[path.extname(f).toLowerCase()] || 'application/octet-stream';
const ISOLATION = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
  'Cross-Origin-Resource-Policy': 'cross-origin',
};

function registerSchemes() {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, allowServiceWorkers: false } },
    { scheme: 'atlas-file', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, bypassCSP: true } },
  ]);
}

function fileResponse(file, req, extraHeaders = {}) {
  let st;
  try { st = fs.statSync(file); } catch { return new Response('Not found', { status: 404, headers: ISOLATION }); }
  if (!st.isFile()) return new Response('Not found', { status: 404, headers: ISOLATION });
  const headers = { 'Content-Type': mimeFor(file), 'Accept-Ranges': 'bytes', ...ISOLATION, ...extraHeaders };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') || '');
  if (range) {
    let start = range[1] === '' ? Math.max(0, st.size - Number(range[2])) : Number(range[1]);
    let end = range[1] === '' || range[2] === '' ? st.size - 1 : Math.min(Number(range[2]), st.size - 1);
    if (start > end || start >= st.size) return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${st.size}` } });
    return new Response(Readable.toWeb(fs.createReadStream(file, { start, end })), { status: 206, headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': String(end - start + 1) } });
  }
  return new Response(Readable.toWeb(fs.createReadStream(file)), { status: 200, headers: { ...headers, 'Content-Length': String(st.size) } });
}

function registerHandlers(webDir) {
  protocol.handle('app', (req) => {
    const u = new URL(req.url);
    let rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
    if (!rel) rel = 'index.html';
    const file = path.normalize(path.join(webDir, rel));
    if (!file.startsWith(path.normalize(webDir))) return new Response('Forbidden', { status: 403 });
    // Single page app: unknown paths without an extension fall back to the shell.
    if (!fs.existsSync(file) && !path.extname(rel)) return fileResponse(path.join(webDir, 'index.html'), req);
    return fileResponse(file, req);
  });
  protocol.handle('atlas-file', (req) => {
    try {
      const u = new URL(req.url);
      const virtual = decodeURIComponent(u.pathname);
      return fileResponse(diskfs.real(virtual), req);
    } catch { return new Response('Forbidden', { status: 403 }); }
  });
}

module.exports = { registerSchemes, registerHandlers, ISOLATION };
