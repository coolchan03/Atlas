import { useChatStore } from '../../../src/stores/chatStore';
import { useUiModeStore } from '../../../src/stores/uiModeStore';

describe('emoji in a phone call', () => {
  it('never reach the screen or the voice while the chat is a call, and are left alone in an ordinary chat', () => {
    useChatStore.getState().clearStreamingMessage();
    useUiModeStore.setState({ interfaceMode: 'audio' } as never);
    ['Sure ', 'thing ', '😀', '! Call ', 'you ', '👍', ' later.'].forEach((t) => useChatStore.getState().appendToStreamingMessage(t));
    expect(useChatStore.getState().streamingMessage).toBe('Sure thing! Call you later.');
    useChatStore.getState().clearStreamingMessage();
    useUiModeStore.setState({ interfaceMode: 'chat' } as never);
    ['Sure ', '😀'].forEach((t) => useChatStore.getState().appendToStreamingMessage(t));
    expect(useChatStore.getState().streamingMessage).toBe('Sure 😀');
  });
});
