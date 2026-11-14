import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';
import { explore } from '../../harness/monkey';
import { withProfiles, seedApp, type Seeded } from '../../harness/monkeySeed';

const mockNav = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => () => undefined), canGoBack: () => true, getParent: () => ({ navigate: jest.fn() }) };
let mockParams: any = {};
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNav, useRoute: () => ({ params: mockParams }), useFocusEffect: (cb: () => void) => { require('react').useEffect(cb, []); }, useIsFocused: () => true,
}));

const CASES: Array<[string, string, string, Record<string, unknown> | ((ids: Seeded) => Record<string, unknown>), number]> = [
  ['StudyScreen', '../../../src/screens/StudyScreen', 'StudyScreen', (ids) => ({ projectId: ids.project }), 160],
  ['MyModelsScreen', '../../../src/screens/MyModelsScreen', 'MyModelsScreen', {}, 120],
  ['PresentationScreen', '../../../src/screens/PresentationScreen', 'PresentationScreen', {}, 160],
  ['AgentEditScreen new', '../../../src/screens/AgentEditScreen', 'AgentEditScreen', {}, 140],
  ['AgentEditScreen edit', '../../../src/screens/AgentEditScreen', 'AgentEditScreen', (ids) => ({ agentId: ids.agent }), 140],
  ['ModelTestScreen', '../../../src/screens/ModelTestScreen', 'ModelTestScreen', (ids) => ({ modelId: ids.model }), 100],
  ['ImageModelTestScreen', '../../../src/screens/ImageModelTestScreen', 'ImageModelTestScreen', (ids) => ({ modelId: ids.image }), 100],
  ['MapsScreen', '../../../src/screens/MapsScreen', 'MapsScreen', {}, 120],
  ['SurvivalManualScreen', '../../../src/screens/SurvivalManualScreen', 'SurvivalManualScreen', {}, 100],
  ['EmergencyScreen', '../../../src/screens/EmergencyScreen', 'EmergencyScreen', {}, 100],
  ['OfflineLibraryScreen', '../../../src/screens/OfflineLibraryScreen', 'OfflineLibraryScreen', {}, 80],
  ['BackupScreen', '../../../src/screens/BackupScreen', 'BackupScreen', {}, 80],
  ['BackgroundSettingsScreen', '../../../src/screens/BackgroundSettingsScreen', 'BackgroundSettingsScreen', {}, 80],
  ['KnowledgeBaseScreen', '../../../src/screens/KnowledgeBaseScreen', 'KnowledgeBaseScreen', (ids) => ({ projectId: ids.project }), 80],
  ['LearningScreen', '../../../src/screens/LearningScreen', 'LearningScreen', {}, 100],
];

describe('screens survive being pressed everywhere, with realistic data', () => {
  it.each(withProfiles(CASES))('%s', async (_name, path, exportName, params, presses, profile) => {
    jest.resetModules();
    installNativeBoundary({ fs: true });
    const rtl = requireRTL();
    const React = require('react');
    const rn = require('react-native');
    try { jest.spyOn(rn.PermissionsAndroid, 'request').mockResolvedValue('granted' as never); jest.spyOn(rn.PermissionsAndroid, 'requestMultiple').mockResolvedValue({} as never); } catch { /* not present */ }
    const ids = seedApp(profile);
    mockParams = typeof params === 'function' ? params(ids) : params;
    const view = rtl.render(React.createElement(require(path)[exportName]));
    for (const seed of [1, 7]) await explore(view as never, { seed, presses: Math.round(presses / 2) });
    view.unmount();
  }, 120000);
});
