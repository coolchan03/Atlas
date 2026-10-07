import { NativeModules, Platform } from 'react-native';
import { holdScreenAwake, releaseScreenAwake, screenAwakeReasons } from '../../../src/atlasTools/runtimePower';

const flushNativeSync = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('runtimePower', () => {
  const native = NativeModules as any;
  const originalOS = Platform.OS;
  let setKeepScreenOn: jest.Mock;
  let setAiWorkActive: jest.Mock;

  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    setKeepScreenOn = jest.fn().mockResolvedValue(true);
    setAiWorkActive = jest.fn().mockResolvedValue(true);
    native.AtlasDevice = { ...(native.AtlasDevice || {}), setKeepScreenOn, setAiWorkActive };
    for (const reason of screenAwakeReasons()) releaseScreenAwake(reason);
    setKeepScreenOn.mockClear();
    setAiWorkActive.mockClear();
  });

  afterEach(() => {
    for (const reason of screenAwakeReasons()) releaseScreenAwake(reason);
    Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
  });

  it('keeps the display awake until every active AI reason is released', async () => {
    holdScreenAwake('model-load');
    holdScreenAwake('generation');
    await flushNativeSync();

    expect(screenAwakeReasons().sort()).toEqual(['generation', 'model-load']);
    expect(setKeepScreenOn).toHaveBeenCalledWith(true);
    expect(setAiWorkActive).toHaveBeenCalledWith(true, expect.any(String));

    releaseScreenAwake('model-load');
    await flushNativeSync();
    expect(screenAwakeReasons()).toEqual(['generation']);
    expect(setKeepScreenOn).not.toHaveBeenCalledWith(false);

    releaseScreenAwake('generation');
    await flushNativeSync();
    expect(screenAwakeReasons()).toEqual([]);
    expect(setKeepScreenOn).toHaveBeenCalledWith(false);
    expect(setAiWorkActive).toHaveBeenCalledWith(false, null);
  });
});
