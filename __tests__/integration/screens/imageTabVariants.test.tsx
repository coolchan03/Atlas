import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';
import { explore } from '../../harness/monkey';
import { seedApp } from '../../harness/monkeySeed';

const remote = (id: string, name: string) => ({ id, name, serverId: 's1', capabilities: { supportsVision: true, supportsToolCalling: false, supportsThinking: false }, lastUpdated: '2026-01-01' });

type Props = Record<string, unknown>;
const CASES: Array<[string, (create: (o: Record<string, unknown>) => unknown) => Props]> = [
  ['nothing downloaded and no servers', () => ({ downloadedImageModels: [], remoteVisionModels: [], activeImageModelId: null, activeRemoteImageModelId: null, onBrowseModels: jest.fn() })],
  ['nothing downloaded, no browse button', () => ({ downloadedImageModels: [], remoteVisionModels: [], activeImageModelId: null, activeRemoteImageModelId: null })],
  ['a loaded local model', (c) => ({ downloadedImageModels: [c({ id: 'a', name: 'Alpha', style: 'creative' }), c({ id: 'b', name: 'Beta', style: '' })], remoteVisionModels: [], activeImageModelId: 'a', activeRemoteImageModelId: null })],
  ['a local model loading', (c) => ({ downloadedImageModels: [c({ id: 'a', name: 'Alpha' }), c({ id: 'b', name: 'Beta' })], remoteVisionModels: [], activeImageModelId: 'a', activeRemoteImageModelId: null, isAnyLoading: true, isLoadingImage: true, loadingModelId: 'b' })],
  ['a loaded remote model', (c) => ({ downloadedImageModels: [c({ id: 'a', name: 'Alpha' })], remoteVisionModels: [{ serverId: 's1', serverName: 'Home PC', models: [remote('r1', 'Remote one'), remote('r2', 'Remote two')] }], activeImageModelId: null, activeRemoteImageModelId: 'r1' })],
  ['an unknown remote model loaded', () => ({ downloadedImageModels: [], remoteVisionModels: [{ serverId: 's1', serverName: 'Home PC', models: [remote('r1', 'Remote one')] }], activeImageModelId: null, activeRemoteImageModelId: 'gone' })],
  ['remote only, nothing loaded', () => ({ downloadedImageModels: [], remoteVisionModels: [{ serverId: 's1', serverName: 'Home PC', models: [remote('r1', 'Remote one')] }], activeImageModelId: null, activeRemoteImageModelId: null })],
];

describe('the image tab of the model picker', () => {
  it.each(CASES)('%s', async (_name, build) => {
    jest.resetModules();
    installNativeBoundary({ fs: true });
    const rtl = requireRTL();
    const React = require('react');
    seedApp('full');
    const { createONNXImageModel } = require('../../utils/factories');
    const props = { isAnyLoading: false, isLoadingImage: false, onSelectImageModel: jest.fn(), onSelectRemoteVisionModel: jest.fn(), onUnloadImageModel: jest.fn(), ...build((o) => createONNXImageModel(o)) };
    const { ImageTab } = require('../../../src/components/ModelSelectorModal/ImageTab');
    const view = rtl.render(React.createElement(ImageTab, props));
    await explore(view as never, { seed: 6, presses: 20 });
    view.unmount();
  }, 60000);
});
