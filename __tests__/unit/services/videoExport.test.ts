import { NativeModules, Platform } from 'react-native';

const synth = jest.fn();
const exportSlides = jest.fn();
const nativeCancel = jest.fn(() => Promise.resolve(true));

const slides = [
  { title: 'One', bullets: ['a', 'b'], narration: 'First slide.' },
  { title: 'Two', bullets: ['c'], narration: 'Second slide.' },
];

describe('videoExport', () => {
  beforeEach(() => {
    jest.resetModules();
    synth.mockReset().mockImplementation((_t: string, p: string) => Promise.resolve(p));
    exportSlides.mockReset().mockResolvedValue({ uri: 'content://media/1', name: 'T.mp4' });
    (NativeModules as any).AtlasTts = {
      setRate: jest.fn(() => Promise.resolve(true)),
      synthesizeToFile: synth,
      cancelSynthesis: jest.fn(() => Promise.resolve(true)),
      addListener: jest.fn(), removeListeners: jest.fn(),
    };
    (NativeModules as any).AtlasVideo = { exportSlides, cancel: nativeCancel, addListener: jest.fn(), removeListeners: jest.fn() };
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    Object.defineProperty(Platform, 'Version', { value: 34, configurable: true });
  });

  it('speaks every slide to a file, then encodes them in order', async () => {
    const svc = require('../../../src/services/videoExport');
    const out = await svc.exportSlidesVideo('T', slides, jest.fn());
    expect(out).toEqual({ uri: 'content://media/1', name: 'T.mp4' });
    expect(synth).toHaveBeenCalledTimes(2);
    expect(synth.mock.calls[0][0]).toBe('One. First slide.');
    const sent = JSON.parse(exportSlides.mock.calls[0][0]);
    expect(sent.map((s: any) => s.title)).toEqual(['One', 'Two']);
    expect(sent[0].wav).toMatch(/slide-0\.wav$/);
    expect(sent[0].bullets).toEqual(['a', 'b']);
  });

  it('stops before encoding when cancelled during the voice step', async () => {
    const svc = require('../../../src/services/videoExport');
    synth.mockImplementationOnce(() => { svc.cancelVideoExport(); return Promise.reject({ code: 'CANCELLED' }); });
    await expect(svc.exportSlidesVideo('T', slides, jest.fn())).rejects.toBeInstanceOf(svc.VideoExportCancelled);
    expect(exportSlides).not.toHaveBeenCalled();
    expect(nativeCancel).toHaveBeenCalled();
  });

  it('is unavailable below Android 10', () => {
    Object.defineProperty(Platform, 'Version', { value: 28, configurable: true });
    const svc = require('../../../src/services/videoExport');
    expect(svc.videoExportAvailable()).toBe(false);
  });
});
