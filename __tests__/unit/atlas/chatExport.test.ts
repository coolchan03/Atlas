import { conversationToText, hasShareableTurns } from '../../../src/utils/chatExport';

const msg = (role: any, content: string, extra: any = {}) => ({ id: content, role, content, timestamp: 1, ...extra });

describe('chat export', () => {
  it('writes the title and the user/assistant turns, skipping system info and tool output', () => {
    const text = conversationToText({ title: 'Trip', messages: [
      msg('user', 'Plan a hike'), msg('system', 'Model loaded', { isSystemInfo: true }),
      msg('tool', '{"results":[]}'), msg('assistant', 'Start early.', { attachments: [{ id: 'i', type: 'image', uri: 'x' }] }),
    ] as any });
    expect(text).toBe('# Trip\n\n**You:** Plan a hike\n\n**Atlas:** Start early.\n_(1 image not included)_\n');
  });
  it('a locked (empty) chat has nothing to share', () => {
    expect(hasShareableTurns({ messages: [] })).toBe(false);
  });
});
