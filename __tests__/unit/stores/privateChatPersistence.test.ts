import { useChatStore } from '../../../src/stores/chatStore';

describe('private (incognito) chats are never persisted', () => {
  it('leaves a private conversation out of what is written to storage, and keeps an ordinary one', () => {
    useChatStore.setState({ conversations: [], activeConversationId: null } as any);
    const publicId = useChatStore.getState().createConversation('m', 'Visible');
    const privateId = useChatStore.getState().createConversation('m', 'Secret', undefined, true);
    useChatStore.getState().setActiveConversation?.(privateId);
    const options = (useChatStore as any).persist.getOptions();
    const saved = options.partialize(useChatStore.getState());
    expect(saved.conversations.map((c: { id: string }) => c.id)).toEqual([publicId]);
    expect(JSON.stringify(saved)).not.toContain('Secret');
    expect(saved.activeConversationId).toBeNull(); // not pointing at a chat that is not saved
  });
});
