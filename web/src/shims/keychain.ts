// react-native-keychain on the web: secrets are encrypted with a non-extractable AES-GCM key kept in
// IndexedDB; the ciphertext lives in localStorage. This guards against casual disk inspection; it is not a
// hardware keystore. In the Windows app the host overrides this with Electron safeStorage (DPAPI).
const DB = 'atlas-keychain';
function openDb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('keys');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function getKey(): Promise<CryptoKey> {
  const db = await openDb();
  const existing = await new Promise<CryptoKey | undefined>((res) => {
    const q = db.transaction('keys').objectStore('keys').get('master');
    q.onsuccess = () => res(q.result as CryptoKey | undefined);
    q.onerror = () => res(undefined);
  });
  if (existing) return existing;
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await new Promise<void>((res) => {
    const t = db.transaction('keys', 'readwrite');
    t.objectStore('keys').put(key, 'master');
    t.oncomplete = () => res();
    t.onerror = () => res();
  });
  return key;
}
const slot = (service?: string) => `atlas.kc.${service || 'default'}`;
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export const ACCESSIBLE = { WHEN_UNLOCKED: 'AccessibleWhenUnlocked', AFTER_FIRST_UNLOCK: 'AccessibleAfterFirstUnlock', ALWAYS: 'AccessibleAlways', WHEN_PASSCODE_SET_THIS_DEVICE_ONLY: 'AccessibleWhenPasscodeSetThisDeviceOnly', WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'AccessibleWhenUnlockedThisDeviceOnly', AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'AccessibleAfterFirstUnlockThisDeviceOnly' };
export const ACCESS_CONTROL = { BIOMETRY_ANY: 'BiometryAny', BIOMETRY_CURRENT_SET: 'BiometryCurrentSet', USER_PRESENCE: 'UserPresence', DEVICE_PASSCODE: 'DevicePasscode' };
export const SECURITY_LEVEL = { ANY: 'ANY', SECURE_SOFTWARE: 'SECURE_SOFTWARE', SECURE_HARDWARE: 'SECURE_HARDWARE' };
export const STORAGE_TYPE = { AES: 'KeystoreAES', RSA: 'KeystoreRSAECB', FB: 'FacebookConceal' };
export const BIOMETRY_TYPE = {};

export async function setGenericPassword(username: string, password: string, opts?: { service?: string }) {
  const host = (globalThis as any).atlasHost?.secrets;
  if (host) {
    await host.set(slot(opts?.service), JSON.stringify({ username, password }));
    return { service: opts?.service ?? 'default', storage: 'host' };
  }
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify({ username, password }));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data));
  localStorage.setItem(slot(opts?.service), JSON.stringify({ iv: b64(iv), ct: b64(ct) }));
  return { service: opts?.service ?? 'default', storage: 'AES-GCM' };
}
export async function getGenericPassword(opts?: { service?: string }) {
  const host = (globalThis as any).atlasHost?.secrets;
  if (host) {
    const raw = await host.get(slot(opts?.service));
    if (!raw) return false;
    const { username, password } = JSON.parse(raw);
    return { username, password, service: opts?.service ?? 'default', storage: 'host' };
  }
  const raw = localStorage.getItem(slot(opts?.service));
  if (!raw) return false;
  try {
    const { iv, ct } = JSON.parse(raw);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await getKey(), unb64(ct));
    const { username, password } = JSON.parse(new TextDecoder().decode(pt));
    return { username, password, service: opts?.service ?? 'default', storage: 'AES-GCM' };
  } catch {
    return false;
  }
}
export async function resetGenericPassword(opts?: { service?: string }) {
  const host = (globalThis as any).atlasHost?.secrets;
  if (host) await host.remove(slot(opts?.service));
  localStorage.removeItem(slot(opts?.service));
  return true;
}
export const getAllGenericPasswordServices = async () => Object.keys(localStorage).filter((k) => k.startsWith('atlas.kc.')).map((k) => k.slice(9));
export const hasGenericPassword = async (opts?: { service?: string }) => !!(await getGenericPassword(opts));
export const canImplyAuthentication = async () => false;
export const getSupportedBiometryType = async () => null;
export const getSecurityLevel = async () => 'SECURE_SOFTWARE';
