import { matchChats } from '../../../src/chats/chatSearch';

const chat = (id: string, title: string, texts: string[], extra: Record<string, unknown> = {}) => ({
  id, title, messages: texts.map((content, i) => ({ id: `${id}${i}`, role: i % 2 ? 'assistant' : 'user', content, timestamp: 0 })), ...extra,
}) as any;
const none = () => null;

describe('matchChats', () => {
  const chats = [chat('a', 'Lease notes', ['How is a lease measured?', 'At present value.']), chat('b', 'Cooking', ['Boil the pasta.']), chat('c', 'Locked', ['secret lease text'], { pinVerifier: 'x' })];

  it('finds a chat by title or message text, ignoring case, and lists all of them for an empty query', () => {
    expect(matchChats(chats, 'PRESENT VALUE', none).map((c) => c.id)).toEqual(['a']);
    expect(matchChats(chats, 'cooking', none).map((c) => c.id)).toEqual(['b']);
    expect(matchChats(chats, '   ', none)).toBe(chats);
  });

  it('never searches the text of a locked chat or of a chat in a protected project', () => {
    expect(matchChats(chats, 'secret', none)).toEqual([]);
    const protectedProject = { id: 'p', name: 'Vault', pinVerifier: 'y' } as any;
    const inProject = chat('d', 'Plain title', ['hidden words'], { projectId: 'p' });
    expect(matchChats([inProject], 'hidden', () => protectedProject)).toEqual([]);
  });

  it('matches every chat of a project whose name matches', () => {
    const project = { id: 'p', name: 'Taxes 2026' } as any;
    const inProject = chat('e', 'Untitled', ['nothing relevant'], { projectId: 'p' });
    expect(matchChats([inProject, chats[1]], 'taxes', (id) => (id === 'p' ? project : null)).map((c) => c.id)).toEqual(['e']);
  });

  it('gives the same answer when the same chat is searched again (the lowered text is kept)', () => {
    const first = matchChats(chats, 'lease', none).map((c) => c.id);
    expect(matchChats(chats, 'lease', none).map((c) => c.id)).toEqual(first);
    expect(first).toEqual(['a']);
  });

  it('reads a message list again when it was added to or edited at its end in place', () => {
    const c = chat('f', 'Notes', ['first words']);
    expect(matchChats([c], 'later', none)).toEqual([]);
    c.messages.push({ id: 'f9', role: 'user', content: 'later words', timestamp: 0 }); // same array, one more message
    expect(matchChats([c], 'later', none)).toHaveLength(1);
    c.messages[c.messages.length - 1].content = 'edited text longer than before';
    expect(matchChats([c], 'edited', none)).toHaveLength(1);
    expect(matchChats([c], 'later', none)).toEqual([]);
  });
});
