/** Saving a research report to a project never copies a PIN-locked or private chat into the plain-text index. */
// The Keystore-backed persistence is a device boundary; keep the chat store in memory.
jest.mock('../../../src/stores/encryptedChatStorage', () => ({
  encryptedChatStorage: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined), removeItem: jest.fn(async () => undefined) },
}));
import { saveReportToProject } from '../../../src/services/researchReportStorage';
import { useProjectStore } from '../../../src/stores/projectStore';
import { useChatStore } from '../../../src/stores/chatStore';

const reply = { id: 'm1', role: 'assistant' as const, content: 'Findings...', timestamp: 1 };

describe('saveReportToProject privacy', () => {
  beforeEach(() => {
    useProjectStore.setState({ projects: [{ id: 'p1', name: 'Biology', description: '', systemPrompt: '', createdAt: '', updatedAt: '' } as any] });
  });

  it('refuses a PIN-locked chat', async () => {
    useChatStore.setState({ conversations: [{ id: 'c1', title: 't', messages: [reply], projectId: 'p1', pinVerifier: 'v', createdAt: '', updatedAt: '' } as any] });
    await expect(saveReportToProject('p1', 'c1', reply)).rejects.toThrow(/PIN-locked/);
  });

  it('refuses a private chat', async () => {
    useChatStore.setState({ conversations: [{ id: 'c2', title: 't', messages: [reply], projectId: 'p1', isPrivate: true, createdAt: '', updatedAt: '' } as any] });
    await expect(saveReportToProject('p1', 'c2', reply)).rejects.toThrow(/Private chats/);
  });
});
