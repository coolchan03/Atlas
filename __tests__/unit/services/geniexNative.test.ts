const mockHandlers: Record<string, (e: any) => void> = {};
jest.mock('react-native', () => ({
  NativeModules: { AtlasGeniex: undefined as any },
  NativeEventEmitter: class { addListener(name: string, fn: (e: any) => void) { mockHandlers[name] = fn; return { remove: () => { delete mockHandlers[name]; } }; } },
}));
import { NativeModules } from 'react-native';
import { generateGeniex, geniexStatus, geniexUsable, loadGeniex } from '../../../src/services/geniexEngine';

const native = (over: any = {}) => ({
  status: jest.fn(async () => ({ packaged: true, soc: 'SM8750', chipSupported: true, reason: '' })),
  load: jest.fn(async () => true), generate: jest.fn(async () => true), stop: jest.fn(async () => true), unload: jest.fn(async () => true), ...over,
});

describe('GenieX bridge', () => {
  afterEach(() => { (NativeModules as any).AtlasGeniex = undefined; });

  it('says "not in this APK" in a normal build and never throws', async () => {
    const s = await geniexStatus();
    expect(s).toMatchObject({ packaged: false, chipSupported: false });
    expect(geniexUsable(s)).toBe(false);
    await expect(loadGeniex('/m.gguf')).rejects.toThrow(/not in this APK/);
    await expect(generateGeniex([{ role: 'user', content: 'hi' }])).rejects.toThrow(/not in this APK/);
  });

  it('refuses a chip GenieX does not support, with the reason', async () => {
    (NativeModules as any).AtlasGeniex = native({ status: jest.fn(async () => ({ packaged: true, soc: 'SM8550', chipSupported: false, reason: 'only 8 Elite' })) });
    await expect(loadGeniex('/m.gguf')).rejects.toThrow('only 8 Elite');
  });

  it('loads on the NPU by default and streams a reply with the engine timings', async () => {
    const n = native();
    (NativeModules as any).AtlasGeniex = n;
    await loadGeniex('/m.gguf', { contextLength: 2048 });
    expect(n.load).toHaveBeenCalledWith('/m.gguf', 2048, true);
    const tokens: string[] = [];
    const p = generateGeniex([{ role: 'user', content: 'hi' }], { onToken: (t) => tokens.push(t) });
    const id = n.generate.mock.calls[0][0];
    mockHandlers.GeniexToken({ sessionId: 'other', text: 'IGNORED' });
    mockHandlers.GeniexToken({ sessionId: id, text: 'Hel' });
    mockHandlers.GeniexToken({ sessionId: id, text: 'lo' });
    mockHandlers.GeniexDone({ sessionId: id, ttftMs: 400, prefillTps: 300, decodeTps: 22, promptTokens: 10, generatedTokens: 2, stopReason: 'eos' });
    const r = await p;
    expect(r.text).toBe('Hello');
    expect(tokens).toEqual(['Hel', 'lo']);
    expect(r.timings).toMatchObject({ ttftMs: 400, decodeTps: 22 });
    expect(Object.keys(mockHandlers)).toEqual([]); // listeners removed
  });

  it('rejects on a native error and stops the reply when aborted', async () => {
    const n = native();
    (NativeModules as any).AtlasGeniex = n;
    const p = generateGeniex([{ role: 'user', content: 'x' }]);
    mockHandlers.GeniexError({ sessionId: n.generate.mock.calls[0][0], message: 'npu failed' });
    await expect(p).rejects.toThrow('npu failed');
    const ctl = new AbortController();
    const q = generateGeniex([{ role: 'user', content: 'x' }], { signal: ctl.signal });
    ctl.abort();
    await expect(q).rejects.toThrow('Stopped.');
    expect(n.stop).toHaveBeenCalled();
  });
});
