import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';
import { explore } from '../../harness/monkey';
import { withProfiles, seedApp, type Seeded } from '../../harness/monkeySeed';

const mockNav = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => () => undefined), canGoBack: () => true, getParent: () => ({ navigate: jest.fn() }) };
let mockParams: any = {};
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNav, useRoute: () => ({ params: mockParams }), useFocusEffect: (cb: () => void) => { require('react').useEffect(cb, []); }, useIsFocused: () => true,
}));

type P = Record<string, unknown> | ((ids: Seeded) => Record<string, unknown>);
const CASES: Array<[string, string, string, P, number]> = [
  ['AtlasHub', '../../../src/screens/AtlasHubScreen', 'AtlasHubScreen', {}, 60],
  ['Phrases', '../../../src/screens/PhrasesScreen', 'PhrasesScreen', {}, 60],
  ['MetalDetector', '../../../src/screens/MetalDetectorScreen', 'MetalDetectorScreen', {}, 40],
  ['NoiseMeter', '../../../src/screens/NoiseMeterScreen', 'NoiseMeterScreen', {}, 40],
  ['Pedometer', '../../../src/screens/PedometerScreen', 'PedometerScreen', {}, 40],
  ['Sensors', '../../../src/sensors/SensorsScreen', 'SensorsScreen', {}, 60],
  ['Agents', '../../../src/screens/AgentsScreen', 'AgentsScreen', {}, 80],
  ['Compass', '../../../src/screens/CompassScreen', 'CompassScreen', {}, 60],
  ['MusicStudio', '../../../src/screens/MusicStudioScreen', 'MusicStudioScreen', {}, 80],
  ['DailyBrief', '../../../src/screens/DailyBriefScreen', 'DailyBriefScreen', {}, 80],
  ['Schedule', '../../../src/schedule/ScheduleScreen', 'ScheduleScreen', {}, 80],
  ['Language', '../../../src/language/LanguageScreen', 'LanguageScreen', {}, 80],
  ['ChatsList', '../../../src/screens/ChatsListScreen', 'ChatsListScreen', {}, 100],
  ['Practice', '../../../src/screens/PracticeScreen', 'PracticeScreen', (i) => ({ projectId: i.project }), 100],
  ['ProjectEdit', '../../../src/screens/ProjectEditScreen', 'ProjectEditScreen', (i) => ({ projectId: i.project }), 80],
  ['ProjectDetail', '../../../src/screens/ProjectDetailScreen', 'ProjectDetailScreen', (i) => ({ projectId: i.project }), 80],
  ['ModelDownload', '../../../src/screens/ModelDownloadScreen', 'ModelDownloadScreen', {}, 60],
  ['DownloadManager', '../../../src/screens/DownloadManagerScreen', 'DownloadManagerScreen', {}, 60],
  ['Appearance', '../../../src/screens/AppearanceScreen', 'AppearanceScreen', {}, 120],
  ['LearningReliability', '../../../src/screens/LearningReliabilityScreen', 'LearningReliabilityScreen', {}, 80],
  ['Recorder', '../../../src/atlasRecorder/RecorderScreen', 'RecorderScreen', {}, 60],
  ['Workflows', '../../../src/workflows/WorkflowsScreen', 'WorkflowsScreen', {}, 80],
  ['Knowledge', '../../../src/knowledge/KnowledgeScreen', 'KnowledgeScreen', {}, 80],
  ['CpaPrep', '../../../src/cpa/CpaScreens', 'CpaPrepScreen', {}, 80],
  ['CpaExam', '../../../src/cpa/CpaScreens', 'CpaExamScreen', { code: 'FAR' }, 100],
  ['Topics', '../../../src/topics/TopicScreens', 'TopicsScreen', {}, 80],
  ['BriefingPaper', '../../../src/screens/BriefingPaperScreen', 'BriefingPaperScreen', (i) => ({ projectId: i.project, createdAt: 4 }), 60],
  ['Models', '../../../src/screens/ModelsScreen', 'ModelsScreen', {}, 100],
  ['Chat', '../../../src/screens/ChatScreen', 'ChatScreen', (i) => ({ conversationId: i.chat }), 80],
];

describe('more screens survive being pressed everywhere, with realistic data', () => {
  it.each(withProfiles(CASES))('%s', async (_name, path, exportName, params, presses, profile) => {
    jest.resetModules();
    installNativeBoundary({ fs: true });
    const rtl = requireRTL();
    const React = require('react');
    const rn = require('react-native');
    try { jest.spyOn(rn.PermissionsAndroid, 'request').mockResolvedValue('granted' as never); jest.spyOn(rn.PermissionsAndroid, 'requestMultiple').mockResolvedValue({} as never); } catch { /* not present */ }
    if (exportName === 'NoiseMeterScreen') jest.doMock('react-native-audio-api', () => ({ AudioRecorder: class { onAudioReady(): void { /* no audio in tests */ } start(): void { /* */ } stop(): void { /* */ } }, AudioManager: { setAudioSessionOptions: jest.fn(), requestRecordingPermissions: jest.fn(async () => 'Granted') } }));
    const ids = seedApp(profile);
    mockParams = typeof params === 'function' ? params(ids) : params;
    if (exportName === 'CpaExamScreen') { const { setupCpaExam } = require('../../../src/cpa/setup'); setupCpaExam('FAR'); }
    const view = rtl.render(React.createElement(require(path)[exportName]));
    for (const seed of [3, 11]) await explore(view as never, { seed, presses: Math.round(presses / 2) });
    view.unmount();
  }, 120000);
});
