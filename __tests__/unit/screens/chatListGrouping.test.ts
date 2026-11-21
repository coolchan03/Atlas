import type { Conversation } from '../../../src/types';
import { buildChatListRows } from '../../../src/screens/chatListGrouping';

const chat = (id: string, projectId?: string, day = '2026-10-13'): Conversation => ({
  id, title: id, modelId: 'm', messages: [],
  createdAt: `${day  }T10:00:00Z`, updatedAt: `${day  }T10:00:00Z`, projectId,
});
describe('project folders in Chats', () => {
  const projects = [{ id: 'p1', name: 'My Project' }, { id: 'p2', name: 'Locked Project', pinVerifier: 'secret' }];
  it('shows collapsed folders and loose chats', () => {
    const rows = buildChatListRows([chat('a', 'p1'), chat('b', 'p1'), chat('loose')], projects, new Set());
    expect(rows.map(r => r.id).sort()).toEqual(['loose', 'project:p1']);
    expect(rows.find(r => r.kind === 'folder')).toMatchObject({ kind: 'folder', count: 2 });
  });
  it('expands a folder once and sorts its child chats', () => {
    const rows = buildChatListRows([chat('older', 'p1', '2026-10-10'), chat('newer', 'p1')], projects, new Set(['p1']));
    expect(rows.map(r => r.id)).toEqual(['project:p1', 'newer', 'older']);
  });
  it('does not expose a protected project name or expand its contents', () => {
    const rows = buildChatListRows([chat('private', 'p2')], projects, new Set(['p2']));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'folder', name: 'Locked project', locked: true });
  });
  it('does not lose chats whose projects were deleted', () => {
    expect(buildChatListRows([chat('orphan', 'gone')], projects, new Set()).map(r => r.id)).toEqual(['orphan']);
  });
});
