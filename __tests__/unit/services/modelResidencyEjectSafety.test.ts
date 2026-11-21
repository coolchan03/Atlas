import { modelResidencyManager } from '../../../src/services/modelResidency';

describe('safe native model ejection', () => {
  const key = 'unload-failure-test';
  afterEach(() => {
    modelResidencyManager.release(key);
  });
  it('keeps a model marked resident when native unload rejects', async () => {
    const unload = jest.fn().mockRejectedValue(new Error('Native engine busy'));
    modelResidencyManager.register({ key, type: 'whisper', sizeMB: 200 }, unload);
    await expect(modelResidencyManager.evictByKey(key)).resolves.toBe(false);
    expect(unload).toHaveBeenCalledTimes(1);
    expect(modelResidencyManager.isResident(key)).toBe(true);
  });
  it('releases residency only when the native unload succeeds', async () => {
    const unload = jest.fn().mockResolvedValue(undefined);
    modelResidencyManager.register({ key, type: 'whisper', sizeMB: 200 }, unload);
    await expect(modelResidencyManager.evictByKey(key)).resolves.toBe(true);
    expect(modelResidencyManager.isResident(key)).toBe(false);
  });
});
