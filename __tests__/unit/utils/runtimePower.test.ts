import { NativeModules, Platform } from 'react-native';
import { holdScreenAwake, releaseScreenAwake, screenAwakeReasons } from '../../../src/atlasTools/runtimePower';

describe('runtimePower', () => {
  const native = NativeModules as any;
  const originalOS = Platform.OS;
  let setKeepScreenOn: jest.Mock;

  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    setKeepScreenOn = jest.fn().mockResolvedValue(true);
    native.AtlasDevice = { ...(native.AtlasDevice || {}), setKeepScreenOn };
    for (const reason of screenAwakeReasons()) releaseScreenAwake(reason);
    setKeepScreenOn.mockClear();
  });

  afterEach(() => {
    for (const reason of screenAwakeReasons()) releaseScreenAwake(reason);
    Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
  });

  it('keeps the display awake until every active AI reason is released', async () => {
    holdScreenAwake('model-load');
    holdScreenAwake('generation');
    await Promise.resolve();

    expect(screenAwakeReasons().sort()).toEqual(['generation', 'model-load']);
    expect(setKeepScreenOn).toHaveBeenCalledWith(true);

    releaseScreenAwake('model-load');
    await Promise.resolve();
    expect(screenAwakeReasons()).toEqual(['generation']);
    expect(setKeepScreenOn).not.toHaveBeenCalledWith(false);

    releaseScreenAwake('generation');
    await Promise.resolve();
    expect(screenAwakeReasons()).toEqual([]);
    expect(setKeepScreenOn).toHaveBeenCalledWith(false);
  });
});
