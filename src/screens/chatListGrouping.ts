import type { Conversation } from '../types';

export type ChatListRow =
  | { kind: 'chat'; id: string; conversation: Conversation; updatedAt: string; nested: boolean; pinned: boolean }
  | { kind: 'folder'; id: string; projectId: string; name: string; count: number; updatedAt: string; locked: boolean; pinned: boolean };

type ChatProject = { id: string; name: string; pinVerifier?: string | null; isPinned?: boolean };

export function buildChatListRows(
  visibleChats: Conversation[], projects: ChatProject[], expanded: ReadonlySet<string>,
): ChatListRow[] {
  const byId = new Map(projects.map(p => [p.id, p]));
  const grouped = new Map<string, Conversation[]>();
  const top: ChatListRow[] = [];
  for (const conversation of visibleChats) {
    const projectId = conversation.projectId;
    if (projectId && byId.has(projectId)) {
      const children = grouped.get(projectId) ?? [];
      children.push(conversation);
      grouped.set(projectId, children);
    } else {
      top.push({ kind: 'chat', id: conversation.id, conversation,
        updatedAt: conversation.updatedAt, nested: false, pinned: !!conversation.isPinned });
    }
  }
  for (const [projectId, children] of grouped) {
    children.sort((a, b) => Number(!!b.isPinned) - Number(!!a.isPinned) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    const project = byId.get(projectId)!;
    top.push({
      kind: 'folder', id: `project:${  projectId}`, projectId,
      name: project.pinVerifier ? 'Locked project' : project.name,
      count: children.length, updatedAt: children[0].updatedAt,
      locked: Boolean(project.pinVerifier), pinned: Boolean(project.isPinned) || children.some(chat => !!chat.isPinned),
    });
  }
  top.sort((a, b) => Number(b.pinned) - Number(a.pinned) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const rows: ChatListRow[] = [];
  for (const row of top) {
    rows.push(row);
    if (row.kind === 'folder' && expanded.has(row.projectId) && !row.locked) {
      for (const chat of [...(grouped.get(row.projectId) ?? [])].sort((a, b) => Number(!!b.isPinned) - Number(!!a.isPinned) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt))) {
        rows.push({ kind: 'chat', id: chat.id, conversation: chat,
          updatedAt: chat.updatedAt, nested: true, pinned: !!chat.isPinned });
      }
    }
  }
  return rows;
}
