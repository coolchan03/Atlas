const mockSeal = jest.fn(async (..._args: any[]) => undefined);
const mockUnlockedProjects = new Set<string>();
jest.mock('../../../src/stores/protectedProjectStorage', () => ({
  ...jest.requireActual('../../../src/stores/protectedProjectStorage'),
  isProtectedProjectUnlocked: (id: string) => mockUnlockedProjects.has(id),
  sealNewProjectChat: (...args: any[]) => mockSeal(...args),
}));

import { useChatStore } from '../../../src/stores/chatStore';
import { useProjectStore } from '../../../src/stores/projectStore';

const protectedProject = { id: 'therapy', name: 'Locked', description: '', systemPrompt: '', pinVerifier: 'pin:v1:x', protectedBlob: 'atlasitem:v1:c2VhbGVk',
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };

beforeEach(() => {
  mockSeal.mockClear(); mockUnlockedProjects.clear();
  useChatStore.setState({ conversations: [], activeConversationId: null });
  useProjectStore.setState({ projects: [protectedProject as any] });
});

it('refuses a new chat while the protected project is locked', () => {
  expect(() => useChatStore.getState().createConversation('m', 'x', 'therapy')).toThrow(/Unlock this protected project/);
  expect(mockSeal).not.toHaveBeenCalled();
});

it('creates and seals a chat while the protected project is unlocked', () => {
  mockUnlockedProjects.add('therapy');
  const id = useChatStore.getState().createConversation('m', 'Session 7', 'therapy');
  expect(useChatStore.getState().conversations.find(c => c.id === id)?.projectId).toBe('therapy');
  expect(mockSeal).toHaveBeenCalledWith(id, 'therapy');
});

it('never seals a temporary private chat (it is not saved at all)', () => {
  mockUnlockedProjects.add('therapy');
  useChatStore.getState().createConversation('m', 'Temp', 'therapy', true);
  expect(mockSeal).not.toHaveBeenCalled();
});
