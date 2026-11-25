// react-native-device-info on the web, from the browser's own (coarse) signals.
const nav: any = typeof navigator !== 'undefined' ? navigator : {};
const memGB = () => Number(nav.deviceMemory) || 4; // Chrome reports 0.25 .. 8
// Windows app: the real machine memory (cached at start-up from the main process); browsers only report a capped figure.
const sys = () => (globalThis as any).__atlasSys as { totalMem: number; freeMem: number } | undefined;
const totalMemory = () => sys()?.totalMem ?? memGB() * 1024 ** 3;

async function battery(): Promise<any | null> {
  try {
    return nav.getBattery ? await nav.getBattery() : null;
  } catch {
    return null;
  }
}
const perfMem = () => (performance as any).memory?.usedJSHeapSize ?? 0;

export const getTotalMemory = async () => totalMemory();
export const getUsedMemory = async () => perfMem();
export const getTotalMemorySync = () => totalMemory();
export const getUsedMemorySync = () => perfMem();
export const getMaxMemory = async () => totalMemory();
export const getBatteryLevel = async () => (await battery())?.level ?? 1;
export const isBatteryCharging = async () => (await battery())?.charging ?? true;
export const getPowerState = async () => {
  const b = await battery();
  return { batteryLevel: b?.level ?? 1, batteryState: b?.charging ? 'charging' : 'unplugged', lowPowerMode: false };
};
export const getModel = () => {
  const h = (globalThis as any).atlasHost;
  if (h) return `${h.platform === 'win32' ? 'Windows PC' : h.platform === 'darwin' ? 'Mac' : 'Linux PC'}${(globalThis as any).__atlasSys?.cpuModel ? ` (${(globalThis as any).__atlasSys.cpuModel.replace(/\(R\)|\(TM\)/g, '').trim()})` : ''}`;
  return nav.userAgentData?.platform ? `${nav.userAgentData.platform} browser` : 'Web browser';
};
export const getBrand = () => 'Web';
export const getDeviceId = () => 'web';
export const getHardware = async () => 'web';
export const getSystemName = () => 'Android';
export const getSystemVersion = () => '14';
export const getVersion = () => (globalThis as any).__ATLAS_VERSION__ ?? '0.0.0';
export const getBuildNumber = () => '1';
export const getBundleId = () => 'ai.atlas.web';
export const getApplicationName = () => 'Atlas';
export const isEmulator = async () => false;
export const isEmulatorSync = () => false;
export const isTablet = () => Math.min(window.innerWidth, window.innerHeight) >= 600;
export const hasNotch = () => false;
export const getUniqueId = async () => {
  let id = localStorage.getItem('atlas.deviceId');
  if (!id) localStorage.setItem('atlas.deviceId', (id = crypto.randomUUID()));
  return id;
};
export const getIpAddress = async () => '127.0.0.1';
export const getFreeDiskStorage = async () => {
  const e = await navigator.storage?.estimate?.();
  return Math.max(0, (e?.quota ?? 0) - (e?.usage ?? 0));
};
export const getTotalDiskCapacity = async () => (await navigator.storage?.estimate?.())?.quota ?? 0;
export const getFreeDiskStorageOld = getFreeDiskStorage;
export const supportedAbis = async () => ['wasm32'];
export const getSupportedAbis = supportedAbis;

const DeviceInfo = {
  getTotalMemory, getUsedMemory, getTotalMemorySync, getUsedMemorySync, getMaxMemory, getBatteryLevel, isBatteryCharging,
  getPowerState, getModel, getBrand, getDeviceId, getHardware, getSystemName, getSystemVersion, getVersion, getBuildNumber,
  getBundleId, getApplicationName, isEmulator, isEmulatorSync, isTablet, hasNotch, getUniqueId, getIpAddress, getFreeDiskStorage,
  getFreeDiskStorageOld, getTotalDiskCapacity, supportedAbis, getSupportedAbis,
  get totalMemory() { return totalMemory(); },
  get usedMemory() { return perfMem(); },
  get availableMemory() { return Math.max(0, totalMemory() - perfMem()); },
};
export default DeviceInfo;
