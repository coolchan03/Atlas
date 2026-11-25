// The cryptography behind PIN-locked chats / projects and password-protected backups. Formats are
// byte-for-byte the same as the Android module (AtlasDeviceModule.kt), so an encrypted backup made on a
// phone restores in the web app and the Windows app, and back:
//   pin:v1:<b64 salt16 + PBKDF2-SHA256(pin, 310000) 32>
//   atlasbackup:v1:<b64 salt16 + iv12 + AES-GCM(ciphertext+tag)>   AAD "atlas-portable-backup:v1"
//   atlasitem:v1:<b64 iv12 + AES-GCM>                               AAD "<kind>:<id>:<verifier>:v1", per-item key
//   atlasenc:v1:<b64 iv12 + AES-GCM>                                AAD "local-llm-chat-storage:v1", device key
// Android keeps the per-item and device keys in the hardware keystore; here they are non-extractable
// WebCrypto keys stored in IndexedDB (the Windows app additionally wraps them with DPAPI via safeStorage).
const ITER = 310000;
const enc = new TextEncoder();
const dec = new TextDecoder();
const subtle = () => crypto.subtle;
const b64 = (u: Uint8Array) => {
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const cat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

async function pbkdf2(secret: string, salt: Uint8Array, usage: 'bits' | KeyUsage[]): Promise<any> {
  const base = await subtle().importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveBits', 'deriveKey']);
  const params = { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER } as Pbkdf2Params;
  if (usage === 'bits') return new Uint8Array(await subtle().deriveBits(params, base, 256));
  return subtle().deriveKey(params, base, { name: 'AES-GCM', length: 256 }, false, usage);
}
const eq = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

// ---- key store (IndexedDB) ---------------------------------------------------------------------
const DB = 'atlas-crypto';
function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('keys');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function kvGet(k: string): Promise<CryptoKey | undefined> {
  const d = await db();
  return new Promise((res) => {
    const q = d.transaction('keys').objectStore('keys').get(k);
    q.onsuccess = () => res(q.result as CryptoKey | undefined);
    q.onerror = () => res(undefined);
  });
}
async function kvSet(k: string, v: CryptoKey) {
  const d = await db();
  await new Promise<void>((res) => {
    const t = d.transaction('keys', 'readwrite');
    t.objectStore('keys').put(v, k);
    t.oncomplete = () => res();
    t.onerror = () => res();
  });
}
async function kvDel(k: string) {
  const d = await db();
  await new Promise<void>((res) => {
    const t = d.transaction('keys', 'readwrite');
    t.objectStore('keys').delete(k);
    t.oncomplete = () => res();
    t.onerror = () => res();
  });
}
async function storedKey(alias: string, create: boolean): Promise<CryptoKey> {
  const have = await kvGet(alias);
  if (have) return have;
  if (!create) throw new Error("This item's encryption key is missing");
  const key = await subtle().generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await kvSet(alias, key);
  return key;
}

async function seal(key: CryptoKey, plain: string, aad: string): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, enc.encode(plain)));
  return cat(iv, ct);
}
async function open(key: CryptoKey, bytes: Uint8Array, aad: string): Promise<string> {
  const pt = await subtle().decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12), additionalData: enc.encode(aad) }, key, bytes.slice(12));
  return dec.decode(pt);
}

// ---- PIN ---------------------------------------------------------------------------------------
const PIN_RE = /^[0-9]{4,12}$/;
export async function createChatPinVerifier(pin: string) {
  if (!PIN_RE.test(pin)) throw new Error('PIN must have 4 to 12 digits');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return 'pin:v1:' + b64(cat(salt, await pbkdf2(pin, salt, 'bits')));
}
async function pinMatches(pin: string, verifier: string) {
  if (!verifier.startsWith('pin:v1:')) throw new Error('Unsupported PIN verifier');
  const bytes = unb64(verifier.slice(7));
  if (bytes.length !== 48) throw new Error('Invalid PIN verifier');
  return eq(bytes.slice(16), await pbkdf2(pin, bytes.slice(0, 16), 'bits'));
}
export const verifyChatPin = (pin: string, verifier: string) => pinMatches(pin, verifier);

// ---- device-bound state ------------------------------------------------------------------------
export async function encryptChatState(plain: string) {
  return 'atlasenc:v1:' + b64(await seal(await storedKey('atlas.chat.storage.v1', true), plain, 'local-llm-chat-storage:v1'));
}
export async function decryptChatState(payload: string) {
  if (!payload.startsWith('atlasenc:v1:')) throw new Error('Unsupported encrypted chat format');
  const bytes = unb64(payload.slice(12));
  if (bytes.length < 29) throw new Error('Invalid encrypted chat payload');
  return open(await storedKey('atlas.chat.storage.v1', false), bytes, 'local-llm-chat-storage:v1');
}

// ---- protected items ---------------------------------------------------------------------------
const alias = (kind: string, id: string) => {
  if (kind !== 'chat' && kind !== 'project') throw new Error('Unsupported protected item type');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error('Invalid protected item ID');
  return `atlas.protected.v1.${kind}.${id}`;
};
export async function encryptProtectedItem(kind: string, id: string, plain: string, pin: string, verifier: string) {
  if (!PIN_RE.test(pin)) throw new Error('PIN must have 4-12 digits');
  if (!(await pinMatches(pin, verifier))) throw new Error('Incorrect PIN');
  return 'atlasitem:v1:' + b64(await seal(await storedKey(alias(kind, id), true), plain, `${kind}:${id}:${verifier}:v1`));
}
export async function decryptProtectedItem(kind: string, id: string, blob: string, pin: string, verifier: string) {
  if (!(await pinMatches(pin, verifier))) throw new Error('Incorrect PIN');
  if (!blob.startsWith('atlasitem:v1:')) throw new Error('Unsupported encrypted item');
  const bytes = unb64(blob.slice(13));
  if (bytes.length < 29) throw new Error('Damaged protected item');
  try {
    return await open(await storedKey(alias(kind, id), false), bytes, `${kind}:${id}:${verifier}:v1`);
  } catch {
    throw new Error('Incorrect PIN or damaged protected item');
  }
}
export async function removeProtectedItemKey(kind: string, id: string, pin: string, verifier: string) {
  if (!(await pinMatches(pin, verifier))) throw new Error('Incorrect PIN');
  await kvDel(alias(kind, id));
  return true;
}

// ---- portable backup ---------------------------------------------------------------------------
export async function encryptPortableBackup(plain: string, passphrase: string) {
  if (passphrase.length < 12) throw new Error('A backup password needs at least 12 characters');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await pbkdf2(passphrase, salt, ['encrypt']);
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode('atlas-portable-backup:v1') }, key, enc.encode(plain)));
  return 'atlasbackup:v1:' + b64(cat(salt, iv, ct));
}
export async function decryptPortableBackup(payload: string, passphrase: string) {
  if (!payload.startsWith('atlasbackup:v1:')) throw new Error('Unsupported encrypted backup');
  const bytes = unb64(payload.slice(15));
  if (bytes.length < 45) throw new Error('Damaged encrypted backup');
  try {
    const key = await pbkdf2(passphrase, bytes.slice(0, 16), ['decrypt']);
    const pt = await subtle().decrypt({ name: 'AES-GCM', iv: bytes.slice(16, 28), additionalData: enc.encode('atlas-portable-backup:v1') }, key, bytes.slice(28));
    return dec.decode(pt);
  } catch {
    throw new Error('Incorrect password or damaged backup');
  }
}
