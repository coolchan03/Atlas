import { NativeModules, Platform, Share } from 'react-native';
import { shareItem } from '../../src/utils/shareItem';

describe('shareItem', () => {
  const original = Platform.OS;
  afterEach(() => { Object.defineProperty(Platform, 'OS', { value: original, configurable: true }); jest.restoreAllMocks(); delete (NativeModules as any).AtlasDevice; });

  it('shares a file through the phone share sheet on Android (React Native ignores a file link there)', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    const shareFile = jest.fn().mockResolvedValue(true);
    (NativeModules as any).AtlasDevice = { shareFile };
    const rn = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as any);
    expect(await shareItem({ title: 'My tune', file: '/docs/tune.wav' })).toBe(true);
    expect(shareFile).toHaveBeenCalledWith('/docs/tune.wav', 'My tune');
    expect(rn).not.toHaveBeenCalled();
  });

  it('shares text with the title, and a closed or failed sheet is not an error', async () => {
    const rn = jest.spyOn(Share, 'share').mockResolvedValueOnce({ action: 'sharedAction' } as any).mockRejectedValueOnce(new Error('closed'));
    expect(await shareItem({ title: 'Report', text: 'hello' })).toBe(true);
    expect(rn).toHaveBeenCalledWith({ title: 'Report', message: 'hello' });
    expect(await shareItem({ text: 'again' })).toBe(false);
  });
});
