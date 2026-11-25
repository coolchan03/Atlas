/** A long recording becomes a deck of flashcards in a project, one passage at a time. Fakes only the device boundary (the engine, files, RAM). */
import { installNativeBoundary, GB, requireRTL } from '../../harness/nativeBoundary';
import { createDownloadedModel } from '../../utils/factories';

const mockNav = { navigate: jest.fn(), goBack: jest.fn() };
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNav, useRoute: () => ({ params: { id: 'rec1' } }), useFocusEffect: () => {}, useIsFocused: () => true }));

it('makes flashcards from the transcript, keeps only supported cards, and opens the deck', async () => {
  const boundary = installNativeBoundary({ llama: true, fs: true, ram: { platform: 'android', totalBytes: 12 * GB, availBytes: 8 * GB } });
  const React = require('react');
  const rtl = requireRTL();
  const { useAppStore } = require('../../../src/stores');
  const { hardwareService } = require('../../../src/services/hardware');
  const { useRecordings } = require('../../../src/atlasRecorder/store');
  const { useStudyStore } = require('../../../src/study/engine');
  const { useProjectStore } = require('../../../src/stores/projectStore');
  const { RecordingDetailScreen } = require('../../../src/atlasRecorder/RecordingDetailScreen');
  useAppStore.getState().updateSettings({ inferenceBackend: 'cpu' });
  boundary.fs!.seedFile('/models/small.gguf', 500 * 1024 * 1024);
  await hardwareService.refreshMemoryInfo();
  useAppStore.setState({ downloadedModels: [createDownloadedModel({ id: 'llm', engine: 'llama', filePath: '/models/small.gguf', fileSize: 500 * 1024 * 1024 })], activeModelId: 'llm' });
  const project = useProjectStore.getState().createProject({ name: 'Biology', description: '', systemPrompt: '', icon: '#10B981' });
  useRecordings.setState({ recordings: [{
    id: 'rec1', title: 'Biology lecture', createdAt: new Date().toISOString(), durationSec: 600, audioPath: '/a.wav', status: 'done', labelled: false,
    utterances: [{ speaker: 0, start: 0, end: 60, text: 'Mitochondria make most of the cell energy. The process is called cellular respiration and it needs oxygen.' }],
  }] });
  // The model's draft has one supported card and one made up.
  boundary.llama!.scriptCompletion({ text: 'Q: What do mitochondria make? | A: Most of the cell energy\nQ: Who discovered penicillin? | A: Alexander Fleming in London\n' });
  const view = rtl.render(React.createElement(RecordingDetailScreen));
  rtl.fireEvent.press(view.getByTestId('flashcards-make'));
  rtl.fireEvent.press(view.getByTestId(`flashcards-in-${project.id}`));
  await rtl.waitFor(() => expect(view.getByTestId('flashcards-note')).toBeTruthy(), { timeout: 8000 });
  const saved = useStudyStore.getState().saved[project.id];
  expect(saved).toHaveLength(1);
  expect(saved[0].cards).toEqual([{ q: 'What do mitochondria make?', a: 'Most of the cell energy', src: [1] }]);
  expect(saved[0].sources[0].text).toMatch(/cellular respiration/);
  expect(mockNav.navigate).toHaveBeenCalledWith('Study', { projectId: project.id, openAt: saved[0].createdAt });
}, 30000);
