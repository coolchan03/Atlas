/**
 * Screens that work with documents can be connected to projects and take files: an agent brings its project folder to its chats,
 * a course on its board can be connected to a project and given files, and Practice takes your own questions and files.
 * Only the picker, the AI and document indexing are faked.
 */
import { installNativeBoundary, requireRTL } from '../harness/nativeBoundary';

let mockParams: any = {};
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
  useRoute: () => ({ params: mockParams }),
}));
jest.mock('@react-native-documents/picker', () => ({
  pick: jest.fn(), pickDirectory: jest.fn(), keepLocalCopy: jest.fn(async ({ files }: any) => files.map((f: any) => ({ status: 'success', localUri: f.uri }))),
  isErrorWithCode: () => false, errorCodes: { OPERATION_CANCELED: 'OPERATION_CANCELED' }, types: { allFiles: '*/*' },
}));
const mockReply = jest.fn();
jest.mock('../../src/study/engine', () => ({ askModel: (...a: unknown[]) => mockReply(...a), gatherSources: jest.fn(async () => []) }));

function open() {
  installNativeBoundary({ fs: true });
  mockNavigate.mockClear();
  const rtl = requireRTL();
  const React = require('react');
  const { Alert } = require('react-native');
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const { ragService } = require('../../src/services/rag');
  const indexed: string[] = [];
  jest.spyOn(ragService, 'getDocumentsByProject').mockResolvedValue([]);
  jest.spyOn(ragService, 'indexDocument').mockImplementation(async (d: any) => { indexed.push(`${d.projectId}:${d.fileName}`); return 1; });
  return { rtl, React, alert, indexed };
}

it('an agent brings its project folder to a new chat, but a chat already in a project keeps its own, and a deleted folder is ignored', () => {
  open();
  const { useAgentStore } = require('../../src/stores/agentStore');
  const { useChatStore } = require('../../src/stores/chatStore');
  const { useProjectStore } = require('../../src/stores/projectStore');
  const therapy = useProjectStore.getState().createProject({ name: 'Therapy', description: '', systemPrompt: '', icon: '#10B981' });
  const work = useProjectStore.getState().createProject({ name: 'Work', description: '', systemPrompt: '', icon: '#10B981' });
  const agent = useAgentStore.getState().createAgent({ name: 'Counselor', description: 'd', systemPrompt: 'p', projectId: therapy.id });

  const chats = useChatStore.getState();
  const fresh = chats.createConversation('m1', 'Chat');
  chats.setConversationAgent(fresh, agent.id);
  expect(useChatStore.getState().conversations.find((c: any) => c.id === fresh).projectId).toBe(therapy.id);

  const inWork = chats.createConversation('m1', 'Work chat', work.id);
  chats.setConversationAgent(inWork, agent.id);
  expect(useChatStore.getState().conversations.find((c: any) => c.id === inWork).projectId).toBe(work.id);

  useProjectStore.getState().deleteProject(therapy.id);
  const later = useChatStore.getState().createConversation('m1', 'Later');
  useChatStore.getState().setConversationAgent(later, agent.id);
  expect(useChatStore.getState().conversations.find((c: any) => c.id === later).projectId).toBeUndefined();
});

it('a course on its board can be connected to a project, and files added from there go into that project', async () => {
  const { rtl, React, indexed } = open();
  const { pick } = require('@react-native-documents/picker');
  const { TopicBoardScreen } = require('../../src/topics/TopicScreens');
  const { useTopics } = require('../../src/topics/store');
  const { useProjectStore } = require('../../src/stores/projectStore');
  const project = useProjectStore.getState().createProject({ name: 'Accounting books', description: '', systemPrompt: '', icon: '#10B981' });
  useTopics.setState({ courses: [{ id: 'c1', topic: 'Accounting', title: 'Accounting', summary: '', style: 's', theme: 't', request: { topic: 'Accounting', goal: '', level: 'Complete beginner', how: '', minutes: 10 },
    squares: [{ key: 's1', format: 'lesson', title: 'Intro', focus: 'x', unit: 'U' }], content: {}, progress: {}, createdAt: 1, sources: [] }] });
  mockParams = { courseId: 'c1' };
  const view = rtl.render(React.createElement(TopicBoardScreen));

  rtl.fireEvent.press(view.getByTestId(`course-project-${project.id}`));
  expect(useTopics.getState().courses[0].projectId).toBe(project.id);

  (pick as jest.Mock).mockResolvedValueOnce([{ uri: 'file:///docs/Textbook.pdf', name: 'Textbook.pdf', size: 1000 }, { uri: 'file:///docs/Bank.docx', name: 'Bank.docx', size: 1000 }]);
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('course-project-files')); });
  await rtl.waitFor(() => expect(indexed).toEqual([`${project.id}:Textbook.pdf`, `${project.id}:Bank.docx`]));

  // A course with no project gets one named after its subject when files are added.
  rtl.fireEvent.press(view.getByTestId('course-project-none'));
  expect(useTopics.getState().courses[0].projectId).toBeUndefined();
  (pick as jest.Mock).mockResolvedValueOnce([{ uri: 'file:///docs/Notes.pdf', name: 'Notes.pdf', size: 1000 }]);
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('course-project-files')); });
  await rtl.waitFor(() => expect(useTopics.getState().courses[0].projectId).toBeTruthy());
  expect(useProjectStore.getState().projects.find((p: any) => p.id === useTopics.getState().courses[0].projectId)?.name).toBe('Accounting documents');
});

it('Practice takes your own questions and files for the project it is open on', async () => {
  const { rtl, React, indexed } = open();
  const { pick } = require('@react-native-documents/picker');
  const { PracticeScreen } = require('../../src/screens/PracticeScreen');
  const { useExerciseStore } = require('../../src/study/exercises');
  useExerciseStore.setState({ exercises: {}, progress: {} });
  mockParams = { projectId: 'p-books' };
  mockReply.mockResolvedValue(JSON.stringify({ questions: [{ question: 'What is the accounting equation?', answer: 'assets = liabilities + equity' }] }));
  const view = rtl.render(React.createElement(PracticeScreen));
  rtl.fireEvent.press(view.getByTestId('practice-add'));
  rtl.fireEvent.changeText(view.getByTestId('import-source'), '1. What is the accounting equation?\nAnswer: assets = liabilities + equity');
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('import-read')); });
  expect(await view.findByTestId('import-review')).toBeTruthy();
  rtl.fireEvent.press(view.getByTestId('import-add'));
  const bank = Object.values(useExerciseStore.getState().exercises) as any[];
  expect(bank).toHaveLength(1);
  expect(bank[0]).toMatchObject({ projectId: 'p-books', prompt: 'What is the accounting equation?' });

  (pick as jest.Mock).mockResolvedValueOnce([{ uri: 'file:///docs/Guide.pdf', name: 'Guide.pdf', size: 1000 }]);
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('practice-add-files')); });
  await rtl.waitFor(() => expect(indexed).toEqual(['p-books:Guide.pdf']));
});
