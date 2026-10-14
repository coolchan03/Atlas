import {
  acceptProposal, buildKnowledgePrompt, ensureChatKnowledge, initialProjectKnowledge,
  parseKnowledgeUpdate, projectKnowledge, removeChatKnowledge, mergeChatMemory, THERAPY_CHAT_TITLES,
} from '../../src/services/projectKnowledge';

describe('project-scoped knowledge and chat memory', () => {
  it('starts optional automation off and provides three editable shared documents', () => {
    const state = initialProjectKnowledge();
    expect(state.autoUpdate).toBe(false);
    expect(state.shared.map(d => d.title)).toEqual(['Personal History', 'AI Instructions', 'Current Progress']);
    expect(state.chats).toEqual({});
  });
  it('offers eight opt-in therapy chat starters', () => {
    expect(THERAPY_CHAT_TITLES).toHaveLength(8);
    expect(new Set(THERAPY_CHAT_TITLES).size).toBe(8);
  });
  it('preserves existing facts when a new AI summary omits them', () => {
    const result = mergeChatMemory('Confirmed: moving in January.\nImportant: keep my cat.', 'Confirmed: moving in January.\nPossible: new housing may help.');
    expect(result).toContain('Important: keep my cat.');
    expect(result).toContain('Possible: new housing may help.');
    expect(mergeChatMemory('Important old fact', '')).toBe('Important old fact');
  });
  it('accepts legacy projects without a knowledge field', () => {
    expect(projectKnowledge(undefined).shared).toHaveLength(3);
    expect(projectKnowledge({ shared: [], chats: {}, autoUpdate: true, proposals: [] }).autoUpdate).toBe(true);
  });
  it('creates and deletes per-chat memory without touching shared notes', () => {
    const created = ensureChatKnowledge(initialProjectKnowledge(), 'chat-a');
    expect(created.chats['chat-a'].content).toBe('');
    const removed = removeChatKnowledge(created, 'chat-a');
    expect(removed.chats['chat-a']).toBeUndefined();
    expect(removed.shared).toHaveLength(3);
  });
  it('always reads shared docs and this chat, never unrelated chat memories', () => {
    let k = initialProjectKnowledge();
    k.shared[0].content = 'The user is relocating.';
    k.chats = {
      a: { chatId: 'a', content: 'Working on relocation planning.', updatedAt: '' },
      b: { chatId: 'b', content: 'Discussed job search and relocating.', updatedAt: '' },
      c: { chatId: 'c', content: 'Private information about housing.', updatedAt: '' },
    };
    const prompt = buildKnowledgePrompt(k, 'a', 'Any relocation job search tips?', [
      { id: 'a', title: 'Career' }, { id: 'b', title: 'Jobs' },
    ]);
    expect(prompt).toContain('The user is relocating.');
    expect(prompt).toContain('Working on relocation planning.');
    expect(prompt).toContain('Discussed job search and relocating.');
    expect(prompt).not.toContain('Private information about housing.');
  });
  it('rejects invalid JSON and raw transcript-like updates', () => {
    expect(parseKnowledgeUpdate('assistant: hi')).toBeNull();
    expect(parseKnowledgeUpdate('{"chatMemory":"User: hello\\nAssistant: hello", "sharedProposal":""}')).toBeNull();
    expect(parseKnowledgeUpdate('{"chatMemory":"Confirmed: planning a move", "sharedProposal":""}')).toEqual({
      chatMemory: 'Confirmed: planning a move', sharedProposal: '',
    });
  });
  it('only updates Current Progress after explicit acceptance', () => {
    const k = initialProjectKnowledge();
    k.proposals = [{ id: 'p', chatId: 'a', content: 'Decided to relocate in January.', createdAt: '' }];
    expect(k.shared.find(d => d.id === 'current-progress')?.content).toBe('');
    const accepted = acceptProposal(k, 'p');
    expect(accepted.shared.find(d => d.id === 'current-progress')?.content).toContain('Decided to relocate');
    expect(accepted.proposals).toHaveLength(0);
    expect(k.proposals).toHaveLength(1); // original immutable
  });
});
