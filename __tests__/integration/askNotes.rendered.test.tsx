import { requireRTL } from '../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }) }));
const mockShaped = jest.fn();
jest.mock('../../src/study/engine', () => ({ askShaped: (...a: unknown[]) => mockShaped(...a), askModel: jest.fn() }));
jest.mock('../../src/services/rag/embedding', () => ({
  embeddingService: {
    load: async () => undefined,
    embed: async (text: string) => { const v = new Array(256).fill(0); for (const w of text.toLowerCase().match(/[a-z]+/g) ?? []) { let h = 0; for (const c of w) h = (h * 31 + c.charCodeAt(0)) % 256; v[h] += 1; } return v; },
  },
}));

it('asks across journal pages, chats and recordings, names where each answer came from, and leaves private chats out', async () => {
  const rtl = requireRTL();
  const React = require('react');
  const { AskNotesScreen } = require('../../src/notes/AskNotesScreen');
  const { useJournal } = require('../../src/journal/store');
  const { useChatStore } = require('../../src/stores/chatStore');
  const { useRecordings } = require('../../src/atlasRecorder/store');

  const view0 = rtl.render(React.createElement(AskNotesScreen));
  expect(await view0.findByTestId('notes-error')).toBeTruthy(); // nothing written yet
  view0.unmount();

  useJournal.setState({ entries: [{ day: '2026-10-02', text: 'I decided to book the ferry to the island for the first week of June.', mood: 4, updatedAt: 1 }] });
  const chat = (id: string, title: string, secret: string, isPrivate: boolean) => ({ id, title, modelId: 'm', createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z', isPrivate,
    messages: [{ id: `${id}1`, role: 'user', content: secret, timestamp: 1 }] });
  useChatStore.setState({ conversations: [chat('c1', 'Garden plans', 'Which tomatoes grow well in a cold greenhouse?', false), chat('c2', 'Hidden', 'My secret locker code is ninety nine.', true)] });
  useRecordings.setState({ recordings: [{ id: 'r1', title: 'Team call', createdAt: '2026-11-10T09:00:00Z', durationSec: 60, audioPath: '/x.wav', status: 'done', segments: [{ start: 0, end: 5, text: 'The budget review moves to Thursday afternoon.' }] }] });

  const view = rtl.render(React.createElement(AskNotesScreen));
  expect(await view.findByTestId('notes-count')).toBeTruthy();
  expect(view.getByTestId('notes-count').props.children.join('')).toMatch(/^3 passages ready/); // journal, garden chat, recording

  mockShaped.mockResolvedValueOnce('You decided to book the ferry for the first week of June [1].');
  rtl.fireEvent.changeText(view.getByTestId('notes-question'), 'When did I decide to book the ferry to the island?');
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('notes-ask')); });
  const [, user, shape] = mockShaped.mock.calls[0];
  expect(shape.label).toBe('Answering from your notes');
  expect(user).toMatch(/\(Journal 2026-10-02\) I decided to book the ferry/);
  expect(user).not.toMatch(/locker/);
  const source = view.getByText(/^\[\d+\] Journal 2026-10-02$/);
  rtl.fireEvent.press(source);
  expect(view.getByTestId('notes-source-text').props.children).toMatch(/ferry to the island/);
});
