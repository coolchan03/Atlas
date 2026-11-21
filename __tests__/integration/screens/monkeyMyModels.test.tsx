import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';
import { explore } from '../../harness/monkey';
import { seedApp } from '../../harness/monkeySeed';

const mockNav = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => () => undefined), canGoBack: () => true, getParent: () => ({ navigate: jest.fn() }) };
jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => mockNav, useRoute: () => ({ params: {} }), useFocusEffect: (cb: () => void) => { require('react').useEffect(cb, []); }, useIsFocused: () => true }));

describe('my models with an SD card, original-weights image models and speech models', () => {
  it.each([true, false])('card has room: %s', async (room) => {
    jest.resetModules();
    installNativeBoundary({ fs: true });
    const rtl = requireRTL();
    const React = require('react');
    seedApp('full');
    const { NativeModules } = require('react-native');
    const GB = 1024 ** 3;
    const volumes = [{ path: '/storage/emulated/0', removable: false, state: 'mounted', free: 20 * GB, total: 64 * GB }, { path: '/storage/ABCD-1234', removable: true, state: 'mounted', free: room ? 40 * GB : 1, total: 64 * GB }];
    const dev = NativeModules.AtlasDevice ?? (NativeModules.AtlasDevice = {});
    dev.storageVolumes = jest.fn().mockResolvedValue(volumes);
    jest.doMock('../../../src/atlasTools/storage', () => ({ ...jest.requireActual('../../../src/atlasTools/storage'), listVolumes: async () => volumes, sdCard: async () => volumes[1] }));
    const { useAppStore } = require('../../../src/stores/appStore');
    const { createONNXImageModel } = require('../../utils/factories');
    useAppStore.setState({ downloadedImageModels: [...useAppStore.getState().downloadedImageModels, createONNXImageModel({ id: 'sd1', name: 'Original weights', backend: 'sdcpp' })] });
    require('../../../src/stores/whisperStore').useWhisperStore.setState({ presentModelIds: ['tiny.en', 'base.en'] });
    require('../../../src/atlasTools/speed').useSpeedStats.setState({ byModel: { m1: { decode: 12, prefill: 80, outLen: 120, samples: 4 } } });
    const { MyModelsScreen } = require('../../../src/screens/MyModelsScreen');
    const view = rtl.render(React.createElement(MyModelsScreen));
    for (const seed of [1, 7, 12]) await explore(view as never, { seed, presses: 100 });
    view.unmount();
  }, 120000);
});
