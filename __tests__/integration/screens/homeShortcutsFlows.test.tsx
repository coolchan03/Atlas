import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';
import { explore } from '../../harness/monkey';
import { seedApp } from '../../harness/monkeySeed';

const ACTIONS = ['chat', 'call', 'resume-last', 'resume-most', 'model-picker', 'music-studio', 'music-player', 'learning', 'learning-status', 'daily-brief', 'recorder', 'compass', 'read-aloud', 'course', 'project', 'practice', 'review'];

async function setup(o: { profile?: 'full' | 'empty' | 'busy'; broken?: boolean; loadFails?: boolean } = {}) {
  jest.resetModules();
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const ids = seedApp(o.profile ?? 'full');
  const loadTextModel = jest.fn(async () => { if (o.loadFails) throw new Error('out of memory'); });
  jest.doMock('../../../src/services/activeModelService', () => ({ activeModelService: { loadTextModel } }));
  const { useHomeShortcuts } = require('../../../src/screens/HomeScreen/homeShortcutStore');
  const { useChatStore } = require('../../../src/stores/chatStore');
  const base = { title: 'W' };
  const shortcuts = ACTIONS.map((action, i) => ({ id: `s${i}`, title: `Widget ${action}`, action, tone: 'balanced', agentId: ids.agent, projectId: ids.project, conversationId: action === 'chat' ? ids.chat : undefined, modelId: action === 'call' ? ids.model : undefined, courseId: 'none' }));
  shortcuts.push({ ...base, id: 'bad1', action: 'chat', title: 'Removed chat', conversationId: 'gone', tone: 'balanced' } as never);
  shortcuts.push({ ...base, id: 'bad2', action: 'call', title: 'Missing model', modelId: 'not-installed', tone: 'warm' } as never);
  if (o.broken) useChatStore.setState({ conversations: [] });
  useHomeShortcuts.setState({ shortcuts: o.profile === 'empty' ? [] : shortcuts });
  const navigation = { navigate: jest.fn(), goBack: jest.fn() };
  const { HomeShortcutsCard } = require('../../../src/screens/HomeScreen/HomeShortcutsCard');
  const view = rtl.render(React.createElement(HomeShortcutsCard, { navigation }));
  await rtl.act(async () => { await new Promise((r) => setImmediate(r)); });
  return { view, rtl, navigation, loadTextModel };
}

describe('the Home widgets card', () => {
  it.each([
    ['every kind of widget', {}],
    ['a busy phone with a model loaded', { profile: 'busy' }],
    ['no widgets yet', { profile: 'empty' }],
    ['no chats to resume', { broken: true }],
    ['a model that will not load', { loadFails: true }],
  ] as Array<[string, Parameters<typeof setup>[0]]>)('can be pressed through with %s', async (_n, o) => {
    const { view } = await setup(o);
    for (const seed of [3, 10, 24, 39, 52]) await explore(view as never, { seed, presses: 70, text: ['My widget', 'x'] });
    view.unmount();
  }, 120000);
});
