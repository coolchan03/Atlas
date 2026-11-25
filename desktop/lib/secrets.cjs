'use strict';
// Secrets (API keys, PIN-derived items) encrypted with the Windows DPAPI via Electron safeStorage.
const { safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

let file = '';
let cache = null;
function init(dir) { file = path.join(dir, 'secrets.json'); }
function load() {
  if (cache) return cache;
  try { cache = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { cache = {}; }
  return cache;
}
const persist = () => fs.writeFileSync(file, JSON.stringify(cache));
const enc = (v) => (safeStorage.isEncryptionAvailable() ? 'e:' + safeStorage.encryptString(v).toString('base64') : 'p:' + Buffer.from(v).toString('base64'));
const dec = (v) => (v.startsWith('e:') ? safeStorage.decryptString(Buffer.from(v.slice(2), 'base64')) : Buffer.from(v.slice(2), 'base64').toString());

module.exports = {
  init,
  get: (k) => { const v = load()[k]; if (!v) return null; try { return dec(v); } catch { return null; } },
  set: (k, v) => { load()[k] = enc(v); persist(); },
  remove: (k) => { delete load()[k]; persist(); },
};
