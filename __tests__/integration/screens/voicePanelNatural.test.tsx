import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';
import { explore } from '../../harness/monkey';
import { seedApp } from '../../harness/monkeySeed';

type O = { current?: string; progress?: boolean; fails?: boolean; imported?: boolean };

async function setup(o: O = {}) {
  jest.resetModules();
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  seedApp('full');
  const rn = require('react-native');
  rn.Platform.OS = 'android';
  const ok = () => Promise.resolve(1);
  rn.NativeModules.AtlasTts = {
    setNeuralVoice: jest.fn(async () => { if (o.fails) throw new Error('voice failed'); return 3; }), installedNeuralVoices: jest.fn(async () => [{ id: 'kokoro-en', bytes: 140e6 }, { id: 'piper-amy', bytes: 65e6 }, ...(o.imported ? [{ id: 'vits-piper-en_GB-x-medium', bytes: 60e6 }] : [])]),
    downloadNeuralVoice: jest.fn(async () => { if (o.fails) throw new Error('offline'); }), deleteNeuralVoice: jest.fn(ok), cancelNeuralDownload: jest.fn(ok),
    setRate: jest.fn(ok), speak: jest.fn(ok), stop: jest.fn(ok), warmUp: jest.fn(ok), listVoices: jest.fn(async () => []),
  };
  const neural = require('../../../src/atlasVoice/neural');
  const store = require('../../../src/atlasVoice/store').useAtlasVoiceStore;
  if (o.current) store.getState().setNeural(o.current, 1, '');
  if (o.progress) neural.useNeuralVoices.getState().set({ progress: { 'piper-ryan': 0.4, 'piper-joe': -1 }, speakerCount: { 'vits-piper-en_GB-x-medium': 4 } });
  const { AtlasVoicePanel } = require('../../../src/atlasVoice/VoicePanel');
  const view = rtl.render(React.createElement(AtlasVoicePanel));
  await rtl.act(async () => { await new Promise((r) => setImmediate(r)); });
  return { view, rtl };
}

describe('the voice panel with natural voices available', () => {
  it.each([
    ['nothing in use', {}],
    ['kokoro in use', { current: 'kokoro-en' }],
    ['a voice downloading', { current: 'piper-amy', progress: true }],
    ['an imported multi-speaker voice in use', { current: 'vits-piper-en_GB-x-medium', imported: true, progress: true }],
    ['voices that fail', { fails: true, current: 'kokoro-en' }],
  ] as Array<[string, O]>)('can be pressed through with %s', async (_n, o) => {
    const { view } = await setup(o);
    for (const seed of [2, 9, 21, 37]) await explore(view as never, { seed, presses: 60 });
    view.unmount();
  }, 120000);
});
