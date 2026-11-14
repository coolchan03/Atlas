/** The cloning voice's quality setting: automatic (best the phone keeps up with) is the default, and only the old default moves to it. */
import AsyncStorage from '@react-native-async-storage/async-storage';

async function loadWith(saved: unknown) {
  jest.resetModules();
  await AsyncStorage.clear();
  if (saved !== undefined) await AsyncStorage.setItem('atlas-voice-settings', JSON.stringify(saved));
  const { useAtlasVoiceStore } = require('../../../src/atlasVoice/store');
  await useAtlasVoiceStore.persist.rehydrate();
  return useAtlasVoiceStore;
}

describe('clone quality setting', () => {
  it('is automatic by default, and accepts automatic and the four fixed steps but nothing else', async () => {
    const store = await loadWith(undefined);
    expect(store.getState().cloneSteps).toBe(0);
    for (const n of [2, 3, 5, 8, 0]) { store.getState().setCloneSteps(n); expect(store.getState().cloneSteps).toBe(n); }
    store.getState().setCloneSteps(4);
    expect(store.getState().cloneSteps).toBe(0);
  });

  it('moves a phone still on the old default of 2 to automatic, and keeps a deliberate 3, 5 or 8', async () => {
    expect((await loadWith({ state: { cloneSteps: 2 }, version: 0 })).getState().cloneSteps).toBe(0);
    for (const n of [3, 5, 8]) expect((await loadWith({ state: { cloneSteps: n }, version: 0 })).getState().cloneSteps).toBe(n);
  });

  it('keeps a 2 chosen after this change', async () => {
    expect((await loadWith({ state: { cloneSteps: 2 }, version: 1 })).getState().cloneSteps).toBe(2);
  });
});
