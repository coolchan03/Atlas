/**
 * Testing a model that the memory check refuses offers the same "Load anyway" as chat, and pressing it
 * loads the model through the real load path with the override.
 */
import { installNativeBoundary, GB, requireRTL } from '../../harness/nativeBoundary';
import { createDownloadedModel } from '../../utils/factories';

const route = { params: { modelId: 'big' } };
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => route,
  useFocusEffect: () => {},
  useIsFocused: () => true,
}));

beforeEach(() => { require('../../../src/stores/appStore').useAppStore.getState().updateSettings({ inferenceBackend: 'cpu' }); });

describe('model test — Load anyway', () => {
  it('shows Load anyway when memory refuses, and forcing it loads the model', async () => {
    const boundary = installNativeBoundary({ llama: true, fs: true, ram: { platform: 'android', totalBytes: 8 * GB, availBytes: 3 * GB } });
    const rtl = requireRTL();
    /* eslint-disable @typescript-eslint/no-var-requires */
    const React = require('react');
    const { hardwareService } = require('../../../src/services/hardware');
    const { useAppStore } = require('../../../src/stores');
    const { ModelTestScreen } = require('../../../src/screens/ModelTestScreen');
    /* eslint-enable @typescript-eslint/no-var-requires */

    boundary.fs!.seedFile('/models/big.gguf', 5 * 1024 * 1024 * 1024);
    await hardwareService.refreshMemoryInfo();
    useAppStore.setState({ downloadedModels: [createDownloadedModel({ id: 'big', engine: 'llama', filePath: '/models/big.gguf', fileSize: 5 * GB })], activeModelId: null });

    const view = rtl.render(React.createElement(ModelTestScreen));
    rtl.fireEvent.press(view.getByText('Start test'));
    await rtl.waitFor(() => { expect(view.queryByText('Load anyway')).not.toBeNull(); });

    rtl.fireEvent.press(view.getByText('Load anyway'));
    await rtl.waitFor(() => { expect(view.queryByText(/^Loaded in /)).not.toBeNull(); }, { timeout: 5000 });
    expect(view.queryByText('Load anyway')).toBeNull();
  });
});
