import { shortcutDestination } from '../../../../src/screens/HomeScreen/homeShortcutStore';

describe('home shortcuts', () => {
  it('opens existing conversations and skips stale deleted chats', () => {
    const chats = [{ id: 'existing' }];
    expect(shortcutDestination('existing', chats, false)).toBe('existing');
    expect(shortcutDestination('deleted', chats, false)).toBe('new');
  });
  it('never jumps into a locked conversation before unlock', () => {
    const chats = [{ id: 'locked', pinVerifier: 'abc' }];
    expect(shortcutDestination('locked', chats, false)).toBe('locked');
    expect(shortcutDestination('locked', chats, true)).toBe('existing');
  });
  it('does not persist shortcuts to private chats', () => {
    expect(shortcutDestination('private', [{ id: 'private', isPrivate: true }], true)).toBe('new');
  });
});
