import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';
import { explore } from '../../harness/monkey';
import { createDownloadedModel, createONNXImageModel } from '../../utils/factories';

const mockNav = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => () => undefined), canGoBack: () => true, getParent: () => ({ navigate: jest.fn() }) };
let mockParams: any = {};
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNav, useRoute: () => ({ params: mockParams }), useFocusEffect: (cb: () => void) => { require('react').useEffect(cb, []); }, useIsFocused: () => true,
}));

type Seed = () => Record<string, unknown>;
const src = [{ n: 1, doc: 'Book', part: 1, text: 'Assets equal liabilities plus equity.' }, { n: 2, doc: 'Book', part: 2, text: 'A lease is a contract to use an asset.' }];
const results = (): unknown[] => [
  { kind: 'guide', createdAt: 1, topic: 'Leases', title: 'Study guide', sources: src, text: '# Guide\n\nA lease is a contract [2].' },
  { kind: 'cards', createdAt: 2, topic: 'Leases', title: 'Cards', sources: src, cards: [{ q: 'What is a lease?', a: 'A contract', src: [2] }, { q: 'Assets?', a: 'What you own', src: [1] }] },
  { kind: 'quiz', createdAt: 3, topic: 'Leases', title: 'Quiz', sources: src, quiz: [{ q: 'Which is a lease?', options: ['a', 'b', 'c'], answer: 1, why: 'because', src: [2] }] },
  { kind: 'podcast', createdAt: 4, topic: 'Leases', title: 'Episode', sources: src, hosts: 2, minutes: 3, podcast: [{ host: 'A', text: 'Welcome to leases.' }, { host: 'B', text: 'A lease is a contract.' }] },
  { kind: 'slides', createdAt: 5, topic: 'Leases', title: 'Deck', sources: src, slides: [{ title: 'Leases', bullets: ['Contract', 'Asset'], narration: 'Leases are contracts.', src: [2] }] },
  { kind: 'game', createdAt: 6, topic: 'Leases', title: 'Memory pairs', sources: src, game: { type: 'pairs', data: { terms: [{ answer: 'Lease', clue: 'Contract to use an asset', src: [2] }, { answer: 'Equity', clue: 'Owner claim', src: [1] }, { answer: 'Assets', clue: 'What you own', src: [1] }, { answer: 'Debt', clue: 'What you owe', src: [1] }], cards: [] } } },
  { kind: 'answer', createdAt: 7, topic: 'Q', title: 'Answer', sources: src, text: 'It is a contract [2].' },
];

const CASES: Array<[string, string, string, Record<string, unknown> | ((ids: { project: string; model: string; image: string; agent: string }) => Record<string, unknown>), number]> = [
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
  it.each(CASES)('%s', async (_name, path, exportName, params, presses) => {
    jest.resetModules();
    installNativeBoundary({ fs: true });
    const rtl = requireRTL();
    const React = require('react');
    const { useAppStore } = require('../../../src/stores');
    const { useProjectStore } = require('../../../src/stores/projectStore');
    const { useStudyStore } = require('../../../src/study/store');
    const { useAgentStore } = require('../../../src/stores/agentStore');
    const model = createDownloadedModel({ id: 'm1', name: 'Test model', filePath: '/models/m1.gguf', fileSize: 800 * 1024 * 1024 });
    const image = createONNXImageModel({ id: 'img1', name: 'Test image model' });
    useAppStore.setState({ downloadedModels: [model, createDownloadedModel({ id: 'm2', name: 'Second', filePath: '/models/m2.gguf', fileSize: 2 * 1024 ** 3 })], activeModelId: 'm1', downloadedImageModels: [image], modelNicknames: { m2: 'Big one' } });
    const project = useProjectStore.getState().createProject({ name: 'FAR prep', description: 'Notes', systemPrompt: 'Tutor', icon: '#1D4ED8' });
    for (const r of results()) useStudyStore.getState().add(project.id, r);
    const agent = useAgentStore.getState().agents[0];
    const ids = { project: project.id, model: 'm1', image: 'img1', agent: agent.id };
    mockParams = typeof params === 'function' ? params(ids) : params;
    const view = rtl.render(React.createElement(require(path)[exportName]));
    for (const seed of [1, 7]) await explore(view as never, { seed, presses: Math.round(presses / 2) });
    view.unmount();
  }, 120000);
});
