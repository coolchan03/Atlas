import { canNameChat, chatTitleMessages, maybeNameChat, parseChatTitle } from '../../src/services/autoChatTitle';
import { useChatStore } from '../../src/stores/chatStore';
import { useAppStore } from '../../src/stores/appStore';

describe('reading the title the AI gives', () => {
  it('takes one short line and drops quotes, labels and the final full stop', () => {
    expect(parseChatTitle('"Planning a Tokyo trip."')).toBe('Planning a Tokyo trip');
    expect(parseChatTitle('Title: Sourdough starter tips\nExplanation: ...')).toBe('Sourdough starter tips');
    expect(parseChatTitle('<think>hmm</think>\n**Fixing a leaky tap**')).toBe('Fixing a leaky tap');
  });
  it('refuses a sentence, an apology or nothing', () => {
    expect(parseChatTitle("Sorry, I can't help with that")).toBeNull();
    expect(parseChatTitle('Here is a title for your chat about the history of Rome and its empire')).toBeNull();
    expect(parseChatTitle('')).toBeNull();
    expect(parseChatTitle('ok')).toBeNull();
  });
  it('asks with the start of the question and of the answer only', () => {
    const m = chatTitleMessages('x'.repeat(900), 'y'.repeat(900));
    expect(m.user.length).toBeLessThan(900);
    expect(m.system).toMatch(/2 to 5 words/);
  });
});

const conv = (over: Record<string, unknown> = {}): any => ({
  id: 'c1', title: 'How do I bake', titleAuto: true, modelId: 'm', createdAt: '', updatedAt: '',
  messages: [{ id: '1', role: 'user', content: 'How do I bake sourdough bread?', timestamp: 1 }, { id: '2', role: 'assistant', content: 'Start with a starter...', timestamp: 2 }], ...over,
});

describe('which chats the AI names', () => {
  it('only an automatic title with a question and an answer, never private or locked chats, never when switched off', () => {
    expect(canNameChat(conv(), true)).toBe(true);
    expect(canNameChat(conv(), false)).toBe(false);
    expect(canNameChat(conv({ titleAuto: false }), true)).toBe(false);
    expect(canNameChat(conv({ isPrivate: true }), true)).toBe(false);
    expect(canNameChat(conv({ pinVerifier: 'x' }), true)).toBe(false);
    expect(canNameChat(conv({ messages: conv().messages.slice(0, 1) }), true)).toBe(false);
    expect(canNameChat(undefined, true)).toBe(false);
  });
});

describe('naming a chat', () => {
  beforeEach(() => { useChatStore.setState({ conversations: [conv()] } as any); useAppStore.getState().updateSettings({ autoNameChats: true }); });

  it('replaces the first-message title with the AI\'s name, once', async () => {
    const ask = jest.fn(async () => '"Baking sourdough bread"');
    expect(await maybeNameChat('c1', ask)).toBe('Baking sourdough bread');
    expect(useChatStore.getState().conversations[0]).toMatchObject({ title: 'Baking sourdough bread', titleAuto: false });
    expect(await maybeNameChat('c1', ask)).toBeNull(); // already named: not asked again
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it('never replaces a name the person typed, even if they typed it while the AI was thinking', async () => {
    let finish!: (t: string) => void;
    const slow = new Promise<string>((r) => { finish = r; });
    const pending = maybeNameChat('c1', () => slow);
    useChatStore.getState().renameConversation('c1', 'My bread chat');
    finish('Baking sourdough bread');
    expect(await pending).toBeNull();
    expect(useChatStore.getState().conversations[0].title).toBe('My bread chat');
  });

  it('keeps the first-message title when the AI cannot be asked or answers badly', async () => {
    expect(await maybeNameChat('c1', async () => { throw new Error('no model'); })).toBeNull();
    expect(await maybeNameChat('c1', async () => "Sorry, I can't")).toBeNull();
    expect(useChatStore.getState().conversations[0].title).toBe('How do I bake');
  });

  it('does nothing when automatic naming is switched off', async () => {
    useAppStore.getState().updateSettings({ autoNameChats: false });
    const ask = jest.fn(async () => 'Baking');
    expect(await maybeNameChat('c1', ask)).toBeNull();
    expect(ask).not.toHaveBeenCalled();
  });

  it('marks a new chat\'s first-message title as automatic', () => {
    const id = useChatStore.getState().createConversation('m');
    useChatStore.getState().addMessage(id, { role: 'user', content: 'Plan my week' } as any);
    expect(useChatStore.getState().conversations.find((c) => c.id === id)).toMatchObject({ title: 'Plan my week', titleAuto: true });
  });
});
