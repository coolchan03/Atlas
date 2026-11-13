import { chatRecoverable, isExpired, restoreFromTrash, TRASH_DAYS, useTrash } from '../../src/trash/trash';
import { useChatStore } from '../../src/stores';
import { deleteChatWithUndo } from '../../src/chats/undoDelete';

const chat = (over: Record<string, unknown> = {}) => ({ id: 'c1', title: 'Tax questions', modelId: 'm', messages: [], createdAt: '', updatedAt: '', ...over });
beforeEach(() => { useTrash.setState({ items: [] }); useChatStore.setState({ conversations: [] } as any); });

describe('UX-17 durable recently deleted', () => {
  it('keeps a deleted ordinary chat and restores it exactly once, after the undo toast is gone', () => {
    jest.useFakeTimers();
    useChatStore.setState({ conversations: [chat() as any] } as any);
    deleteChatWithUndo('c1');
    jest.advanceTimersByTime(60_000); // the toast is long gone
    jest.useRealTimers();
    expect(useChatStore.getState().conversations).toHaveLength(0);
    const item = useTrash.getState().items[0];
    expect(item).toMatchObject({ kind: 'chat', originalId: 'c1', title: 'Tax questions' });
    expect(restoreFromTrash(item.id)).toBeNull();
    expect(useChatStore.getState().conversations.map((c) => c.id)).toEqual(['c1']);
    expect(useTrash.getState().items).toHaveLength(0);
  });
  it('never keeps a locked or private chat', () => {
    expect(chatRecoverable({ pinVerifier: 'x' })).toBe(false);
    expect(chatRecoverable({ isPrivate: true })).toBe(false);
    useChatStore.setState({ conversations: [chat({ pinVerifier: 'x' }) as any] } as any);
    deleteChatWithUndo('c1');
    expect(useTrash.getState().items).toHaveLength(0);
  });
  it('does not restore a copy of something that exists again', () => {
    useTrash.getState().add({ kind: 'chat', originalId: 'c1', title: 'Tax questions', payload: chat() });
    useChatStore.setState({ conversations: [chat() as any] } as any);
    expect(restoreFromTrash(useTrash.getState().items[0].id)).toMatch(/already exists/);
    expect(useChatStore.getState().conversations).toHaveLength(1);
  });
  it('a course comes back to its own project and an old item is gone after the keep period', () => {
    const { useTopics } = require('../../src/topics/store');
    useTopics.setState({ courses: [] });
    useTrash.getState().add({ kind: 'course', originalId: 'k1', title: 'FAR board', payload: { id: 'k1', title: 'FAR board', projectId: 'p-far', squares: [] } });
    expect(restoreFromTrash(useTrash.getState().items[0].id)).toBeNull();
    expect(useTopics.getState().courses[0]).toMatchObject({ id: 'k1', projectId: 'p-far' });
    useTrash.getState().add({ kind: 'chat', originalId: 'old', title: 'Old', payload: chat({ id: 'old' }) });
    useTrash.setState((s) => ({ items: s.items.map((i) => ({ ...i, deletedAt: Date.now() - (TRASH_DAYS + 1) * 86400000 })) }));
    expect(isExpired(useTrash.getState().items[0])).toBe(true);
    expect(restoreFromTrash(useTrash.getState().items[0].id)).toMatch(/gone/);
  });
});
