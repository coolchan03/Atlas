/**
 * Home widgets open what they say: screen widgets go to their screen, resume widgets say when there is no chat,
 * and a chat widget that points at a model that is not installed explains why it will not start.
 * Fakes only the device boundary.
 */
import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';

const mockNavigate = jest.fn();
const navigation = { navigate: jest.fn(), getParent: () => ({ navigate: mockNavigate }) };
jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }) }));

function setup(shortcuts: Array<Record<string, unknown>>, android = false) {
  installNativeBoundary({ fs: true });
  if (android) {
    const { NativeModules, Platform } = require('react-native');
    Platform.OS = 'android';
    NativeModules.AtlasTts = { addListener: jest.fn(), removeListeners: jest.fn() };
  }
  const rtl = requireRTL();
  const React = require('react');
  const { Alert } = require('react-native');
  const { HomeShortcutsCard } = require('../../../src/screens/HomeScreen/HomeShortcutsCard');
  const { useHomeShortcuts } = require('../../../src/screens/HomeScreen/homeShortcutStore');
  useHomeShortcuts.setState({ shortcuts: [] });
  const ids = shortcuts.map((s) => useHomeShortcuts.getState().addShortcut(s).id);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const view = rtl.render(React.createElement(HomeShortcutsCard, { navigation }));
  return { rtl, view, ids, alert };
}

beforeEach(() => { mockNavigate.mockClear(); });

it('opens the screen a widget is set to open', () => {
  const { rtl, view, ids } = setup([{ title: 'Level', action: 'compass' }, { title: 'Music', action: 'music-studio' }]);
  rtl.fireEvent.press(view.getByTestId(`launch-shortcut-${ids[0]}`));
  expect(mockNavigate).toHaveBeenLastCalledWith('Compass', undefined);
  rtl.fireEvent.press(view.getByTestId(`launch-shortcut-${ids[1]}`));
  expect(mockNavigate).toHaveBeenLastCalledWith('MusicStudio', undefined);
});

it('shows the Read aloud widget and opens the Read aloud screen from its title', () => {
  const { rtl, view, ids } = setup([{ title: 'Reader', action: 'read-aloud' }]);
  expect(view.getByTestId('home-read-aloud-widget')).toBeTruthy();
  rtl.fireEvent.press(view.getByTestId(`launch-shortcut-${ids[0]}`));
  expect(mockNavigate).toHaveBeenLastCalledWith('ReadAloud', undefined);
});

it('says so when a resume widget has no chat to resume', async () => {
  const { rtl, view, ids, alert } = setup([{ title: 'Resume', action: 'resume-last' }]);
  rtl.fireEvent.press(view.getByTestId(`launch-shortcut-${ids[0]}`));
  await rtl.waitFor(() => expect(alert).toHaveBeenCalledWith('No available chat', expect.any(String)));
  expect(mockNavigate).not.toHaveBeenCalled();
});

it('explains why a chat widget with a missing model does not start', async () => {
  const { rtl, view, ids, alert } = setup([{ title: 'Old model', action: 'chat', modelId: 'not-installed' }]);
  rtl.fireEvent.press(view.getByTestId(`launch-shortcut-${ids[0]}`));
  await rtl.waitFor(() => expect(alert).toHaveBeenCalledWith('Model missing', expect.any(String)));
  expect(mockNavigate).not.toHaveBeenCalled();
});

it('the Call tile lets you call a chosen agent, with a chosen model and project folder, and save it as a Home button', async () => {
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const { NativeModules, Platform } = require('react-native');
  Platform.OS = 'android';
  NativeModules.AtlasTts = { addListener: jest.fn(), removeListeners: jest.fn() };
  const { CallSetupScreen } = require('../../../src/screens/CallSetupScreen');
  const { useAppStore } = require('../../../src/stores/appStore');
  const { useProjectStore } = require('../../../src/stores/projectStore');
  const { useAgentStore } = require('../../../src/stores/agentStore');
  const { useAtlasVoiceStore } = require('../../../src/atlasVoice/store');
  const { useChatStore } = require('../../../src/stores/chatStore');
  const { activeModelService } = require('../../../src/services/activeModelService');
  const { useHomeShortcuts } = require('../../../src/screens/HomeScreen/homeShortcutStore');
  const { useCallPrefs } = require('../../../src/screens/HomeScreen/callPrefs');
  const loadTextModel = jest.spyOn(activeModelService, 'loadTextModel').mockResolvedValue(undefined);
  jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => undefined);
  const project = useProjectStore.getState().createProject({ name: 'Therapy', description: 'My sessions', systemPrompt: '', icon: '#10B981' });
  useAppStore.setState({ activeModelId: 'm1', downloadedModels: [{ id: 'm1', name: 'Small model' }, { id: 'm2', name: 'Big model' }] });
  useHomeShortcuts.setState({ shortcuts: [] });
  useCallPrefs.setState({ last: {} });
  const therapist = useAgentStore.getState().agents.find((a: { name: string }) => a.name === 'Therapist');
  const jake = useAgentStore.getState().agents.find((a: { name: string }) => a.name.startsWith('Jake'));
  expect(therapist).toBeTruthy();
  expect(jake).toBeTruthy();

  const view = rtl.render(React.createElement(CallSetupScreen));
  rtl.fireEvent.press(view.getByTestId(`call-agent-${therapist.id}`));
  rtl.fireEvent.press(view.getByTestId('call-model-m2'));
  rtl.fireEvent.press(view.getByTestId(`call-project-${project.id}`));
  expect(view.getByText('Call Therapist')).toBeTruthy();
  rtl.fireEvent.press(view.getByTestId('call-save'));
  expect(useHomeShortcuts.getState().shortcuts[0]).toMatchObject({ title: 'Call Therapist', action: 'call', agentId: therapist.id, modelId: 'm2', projectId: project.id });
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('call-start')); });
  await rtl.waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('Chat', { conversationId: expect.any(String) }));
  expect(loadTextModel).toHaveBeenCalledWith('m2');
  const chat = useChatStore.getState().conversations.find((c: { title: string }) => c.title === 'Call Therapist');
  expect(chat).toMatchObject({ agentId: therapist.id, projectId: project.id, modelId: 'm2' });
  expect(useAtlasVoiceStore.getState().handsFree).toBe(true);
  expect(useCallPrefs.getState().last).toMatchObject({ agentId: therapist.id, modelId: 'm2', projectId: project.id }); // remembered for next time

  // The next time, one tap calls the same agent again.
  expect(view.getByText('Call Therapist again')).toBeTruthy();
  const before = useChatStore.getState().conversations.length;
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('call-again')); });
  await rtl.waitFor(() => expect(useChatStore.getState().conversations.length).toBe(before + 1));

  // Jake, with whatever model is loaded and no project.
  rtl.fireEvent.press(view.getByTestId(`call-agent-${jake.id}`));
  rtl.fireEvent.press(view.getByTestId('call-model-none'));
  rtl.fireEvent.press(view.getByTestId('call-project-none'));
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('call-start')); });
  await rtl.waitFor(() => expect(useChatStore.getState().conversations.some((c: { agentId?: string }) => c.agentId === jake.id)).toBe(true));
});

it('home can hold several call buttons, each with its own agent, model, project and chat, and one can be edited', async () => {
  const { rtl, view } = setup([], true);
  const { useAppStore } = require('../../../src/stores/appStore');
  const { useProjectStore } = require('../../../src/stores/projectStore');
  const { useAgentStore } = require('../../../src/stores/agentStore');
  const { useChatStore } = require('../../../src/stores/chatStore');
  const { activeModelService } = require('../../../src/services/activeModelService');
  const loadTextModel = jest.spyOn(activeModelService, 'loadTextModel').mockResolvedValue(undefined);
  const project = useProjectStore.getState().createProject({ name: 'Therapy', description: '', systemPrompt: '', icon: '#10B981' });
  useAppStore.setState({ activeModelId: 'm1', downloadedModels: [{ id: 'm1', name: 'Small model' }, { id: 'm2', name: 'Big model' }] });
  const therapist = useAgentStore.getState().agents.find((a: { name: string }) => a.name === 'Therapist');
  const jake = useAgentStore.getState().agents.find((a: { name: string }) => a.name.startsWith('Jake'));
  const past = useChatStore.getState().createConversation('m1', 'Monday session', project.id);
  const { useHomeShortcuts: shortcutsStore } = require('../../../src/screens/HomeScreen/homeShortcutStore');
  let ids: string[] = [];
  rtl.act(() => {
    ids = [
      shortcutsStore.getState().addShortcut({ title: 'Call Therapist', action: 'call', agentId: therapist.id, modelId: 'm2', projectId: project.id }).id,
      shortcutsStore.getState().addShortcut({ title: 'Call Jake', action: 'call', agentId: jake.id, conversationId: past }).id,
    ];
  });
  expect(view.getByText(/Call · Therapist · Big model · Therapy/)).toBeTruthy();
  expect(view.getByText(/Call · .*Monday session/)).toBeTruthy();

  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId(`launch-shortcut-${ids[0]}`)); });
  await rtl.waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('Chat', { conversationId: expect.any(String) }));
  expect(loadTextModel).toHaveBeenLastCalledWith('m2');
  mockNavigate.mockClear();
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId(`launch-shortcut-${ids[1]}`)); });
  await rtl.waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('Chat', { conversationId: past }));

  // Change the first button to the small model.
  rtl.fireEvent.press(view.getByTestId(`edit-shortcut-${ids[0]}`));
  rtl.fireEvent.press(view.getByText('Small model'));
  rtl.fireEvent.press(view.getByText('Save changes'));
  const { useHomeShortcuts } = require('../../../src/screens/HomeScreen/homeShortcutStore');
  expect(useHomeShortcuts.getState().shortcuts).toHaveLength(2);
  expect(useHomeShortcuts.getState().shortcuts[0]).toMatchObject({ id: ids[0], modelId: 'm1', agentId: therapist.id });
});

it('a widget can open one course board, one project, or practice for a project', async () => {
  const { rtl, view } = setup([]);
  const { useTopics } = require('../../../src/topics/store');
  const { useProjectStore } = require('../../../src/stores/projectStore');
  const { useHomeShortcuts } = require('../../../src/screens/HomeScreen/homeShortcutStore');
  const project = useProjectStore.getState().createProject({ name: 'REG books', description: '', systemPrompt: '', icon: '#10B981' });
  useTopics.setState({ courses: [{ id: 'c9', topic: 'REG', title: 'REG board', summary: '', style: '', theme: '', request: { topic: 'REG', goal: '', level: '', how: '', minutes: 10 }, squares: [], content: {}, progress: {}, createdAt: 1, sources: [] }] });
  let ids: string[] = [];
  rtl.act(() => {
    const add = useHomeShortcuts.getState().addShortcut;
    ids = [add({ title: 'REG board', action: 'course', courseId: 'c9' }).id, add({ title: 'REG books', action: 'project', projectId: project.id }).id, add({ title: 'REG practice', action: 'practice', projectId: project.id }).id];
  });
  expect(view.getByText(/Open a course board · REG board/)).toBeTruthy();
  rtl.fireEvent.press(view.getByTestId(`launch-shortcut-${ids[0]}`));
  expect(mockNavigate).toHaveBeenLastCalledWith('TopicBoard', { courseId: 'c9' });
  rtl.fireEvent.press(view.getByTestId(`launch-shortcut-${ids[1]}`));
  expect(mockNavigate).toHaveBeenLastCalledWith('ProjectDetail', { projectId: project.id });
  rtl.fireEvent.press(view.getByTestId(`launch-shortcut-${ids[2]}`));
  expect(mockNavigate).toHaveBeenLastCalledWith('Practice', { projectId: project.id });
});
