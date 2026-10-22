import AsyncStorage from '@react-native-async-storage/async-storage';

/** Native peer transport and one interrupted storage write; app sync logic stays real. */
export function installNearbySyncBoundary() {
  const RN = require('react-native');
  const previousPlatform = RN.Platform.OS;
  const previousModule = RN.NativeModules.AtlasNearbySync;
  const setItem = AsyncStorage.setItem as jest.Mock;
  const originalSetItem = setItem.getMockImplementation()!;
  const alert = jest.spyOn(RN.Alert, 'alert').mockImplementation(() => undefined);
  const peerId = 'peer1234';
  let paired = false;
  let payload: object = { version: 1, sourceId: peerId, projects: [], conversations: [], agents: [] };
  let failedKey: string | null = null;
  const reply = () => ({ peerId, payload: JSON.stringify(payload), transport: 'wifi' });

  RN.Platform.OS = 'android';
  RN.NativeModules.AtlasNearbySync = {
    start: async () => ({ deviceId: 'local5678', address: '10.0.0.2', port: 1 }),
    stop: async () => true,
    pair: async () => { paired = true; return reply(); },
    sync: async () => reply(),
    respond: async () => true,
    peers: async () => paired ? [{ id: peerId, address: '10.0.0.3' }] : [],
    unpair: async () => { paired = false; return true; },
    addListener: () => undefined,
    removeListeners: () => undefined,
  };
  setItem.mockImplementation((key: string, value: string) => {
    if (key === failedKey) {
      failedKey = null;
      return Promise.reject(new Error('Device storage write interrupted'));
    }
    return originalSetItem(key, value);
  });

  return {
    peerId,
    setPayload(stores: Record<string, { value: string; changedAt: number }>) {
      payload = { version: 1, sourceId: peerId, projects: [], conversations: [], agents: [], stores };
    },
    setSnapshot(items: { projects: object[]; conversations: object[] }) {
      payload = { version: 1, sourceId: peerId, agents: [], ...items };
    },
    failNextWrite(key: string) { failedKey = key; },
    restore() {
      failedKey = null;
      setItem.mockImplementation(originalSetItem);
      alert.mockRestore();
      RN.NativeModules.AtlasNearbySync = previousModule;
      RN.Platform.OS = previousPlatform;
    },
  };
}
