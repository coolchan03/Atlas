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

  it('one feature letting go does not turn the screen off for another (learning kept on while Practice closes)', async () => {
    const { holdScreenOnly, holdBackgroundWork } = require('../../../src/atlasTools/runtimePower');
    holdBackgroundWork('learning', true);
    holdScreenOnly('learning', true);
    holdScreenOnly('screen:practice', true);
    await flushNativeSync();
    expect(setKeepScreenOn).toHaveBeenCalledWith(true);
    expect(setAiWorkActive).toHaveBeenCalledWith(true, 'Learning in the background');
    holdScreenOnly('screen:practice', false);
    await flushNativeSync();
    expect(setKeepScreenOn).not.toHaveBeenCalledWith(false);
    // The person turns the option off: the display may sleep, but learning keeps going in the background.
    holdScreenOnly('learning', false);
    await flushNativeSync();
    expect(setKeepScreenOn).toHaveBeenCalledWith(false);
    expect(setAiWorkActive).not.toHaveBeenCalledWith(false, null);
    holdBackgroundWork('learning', false);
    await flushNativeSync();
    expect(setAiWorkActive).toHaveBeenCalledWith(false, null);
  });

  it('a screen that only needs the display awake does not start the AI foreground notice', async () => {
    const { holdScreenOnly } = require('../../../src/atlasTools/runtimePower');
    holdScreenOnly('screen:recorder', true);
    await flushNativeSync();
    expect(setKeepScreenOn).toHaveBeenCalledWith(true);
    expect(setAiWorkActive).not.toHaveBeenCalled();
    holdScreenOnly('screen:recorder', false);
    await flushNativeSync();
  });
});
