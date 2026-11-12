import { extractMemoryCandidate } from '../../../src/stores/autoMemory';

describe('consent-gated auto-memory extraction', () => {
  it('recognizes explicit stable preferences only', () => {
    expect(extractMemoryCandidate('I prefer learning with practice questions.')).toEqual({ fact: 'I prefer learning with practice questions.', category: 'preferences' });
    expect(extractMemoryCandidate('Can you explain a tax law?')).toBeNull();
  });
  it('never classifies mental health facts as safe to auto-save', () => {
    expect(extractMemoryCandidate('I like talking about my depression in therapy.')?.category).toBe('therapy');
    expect(extractMemoryCandidate('My goal is to process grief at my own pace.')?.category).toBe('therapy');
    expect(extractMemoryCandidate('I want to work on grief.')?.category).toBe('therapy');
  });
});

describe('auto-memory and protected projects', () => {
  it('does not read messages from a chat filed under a PIN-protected project', () => {
    const { useAutoMemory } = require('../../../src/stores/autoMemory');
    const { useChatStore } = require('../../../src/stores/chatStore');
    const refs = require('../../../src/stores/storeRefs');
    useAutoMemory.setState({ enabled: true, pending: [] });
    jest.spyOn(refs, 'projectStoreRef').mockReturnValue({ getState: () => ({ getProject: (id: string) => (id === 'locked' ? { pinVerifier: 'x' } : { id }) }) });
    const say = (projectId?: string) => {
      const id = useChatStore.getState().createConversation('model', 'Chat', projectId);
      useChatStore.getState().addMessage(id, { role: 'user', content: 'I prefer learning with practice questions.' });
    };
    say('locked');
    expect(useAutoMemory.getState().pending).toEqual([]);
    say('open');
    expect(useAutoMemory.getState().pending).toHaveLength(1);
  });
});
