import { sha256 } from 'js-sha256';
import type { Conversation, Project } from '../../types';
import type { Agent } from '../../stores/agentStore';
import type { ProjectBackupFile } from '../../atlasTools/projectBackupFiles';

/** Copy-on-conflict synchronization. Remote data is never allowed to erase a local edit. */
export interface SyncSnapshot {
  version: 1;
  sourceId: string;
  projects: Project[];
  conversations: Conversation[];
  agents: Agent[];
  files?: ProjectBackupFile[];
  // Transport and storage are handled separately; no credentials, model weights or keys.
}
export interface MergeResult<T> { items: T[]; added: number; updated: number; conflicts: number }
type RecordItem = { id: string; updatedAt: string };
const validTime = (date: string) => Number.isFinite(Date.parse(date)) ? Date.parse(date) : 0;
const stable = (data: unknown): string => JSON.stringify(data);
const conflictId = (id: string, item: unknown) => `${id  }-peer-${  sha256(stable(item)).slice(0, 12)}`;
function safeRecord(item: RecordItem): boolean {
  return item !== null && typeof item === 'object' &&
    /^[\w.-]{1,160}$/.test(item.id) && typeof item.updatedAt === 'string';
}
const isProtected = (item: { pinVerifier?: string; protectedBlob?: string; isPrivate?: boolean }) =>
  Boolean(item.pinVerifier || item.protectedBlob || item.isPrivate);

/** A prefix is safe: it includes the old messages and appends new ones. */
function messagesArePrefix(a: Conversation, b: Conversation): boolean {
  if (a.messages.length > b.messages.length) return false;
  return a.messages.every((msg, index) => stable(msg) === stable(b.messages[index]));
}
function preserveConflict<T extends RecordItem>(items: T[], candidate: T, suffix: string): boolean {
  const id = conflictId(candidate.id, candidate);
  if (items.some(item => item.id === id)) return false;
  const fork = { ...candidate, id, ...('title' in candidate
    ? { title: `${String((candidate as { title: string }).title)  } (sync conflict)` }
    : 'name' in candidate ? { name: String((candidate as { name: string }).name) + suffix } : {}) };
  items.push(fork as T);
  return true;
}
export function mergeConversations(local: Conversation[], remote: Conversation[]): MergeResult<Conversation> {
  const output = [...local];
  let added = 0, updated = 0, conflicts = 0;
  for (const incoming of remote) {
    if (!safeRecord(incoming) || !Array.isArray(incoming.messages) || isProtected(incoming)) continue;
    const index = output.findIndex(v => v.id === incoming.id);
    if (index < 0) { output.push(incoming); added++; continue; }
    const current = output[index];
    if (isProtected(current)) continue;
    if (stable(current) === stable(incoming)) continue;
    // If either side only appended, take the superset. Otherwise fork the losing
    // side, including when a newer edit deleted an earlier message.
    if (messagesArePrefix(current, incoming) && current.messages.length < incoming.messages.length) {
      output[index] = { ...incoming, isArchived: incoming.isArchived ?? current.isArchived };
      updated++; continue;
    }
    if (messagesArePrefix(incoming, current) && current.messages.length > incoming.messages.length) {
      if (validTime(incoming.updatedAt) > validTime(current.updatedAt)) {
        if (preserveConflict(output, current, ' (sync conflict)')) conflicts++;
        output[index] = incoming;
        updated++;
      }
      continue;
    }
    const remoteWins = validTime(incoming.updatedAt) > validTime(current.updatedAt);
    if (remoteWins) {
      if (preserveConflict(output, current, ' (sync conflict)')) conflicts++;
      output[index] = incoming;
      updated++;
    } else if (preserveConflict(output, incoming, ' (sync conflict)')) conflicts++;
  }
  return { items: output, added, updated, conflicts };
}
function mergeNamed<T extends RecordItem & { name: string; pinVerifier?: string; protectedBlob?: string }>(
  local: T[], remote: T[],
): MergeResult<T> {
  const output = [...local];
  let added = 0, updated = 0, conflicts = 0;
  for (const incoming of remote) {
    if (!safeRecord(incoming) || !incoming.name || isProtected(incoming)) continue;
    const index = output.findIndex(item => item.id === incoming.id);
    if (index < 0) { output.push(incoming); added++; continue; }
    const existing = output[index];
    if (isProtected(existing) || stable(existing) === stable(incoming)) continue;
    const remoteWins = validTime(incoming.updatedAt) > validTime(existing.updatedAt);
    if (remoteWins) {
      if (preserveConflict(output, existing, ' (sync conflict)')) conflicts++;
      output[index] = incoming; updated++;
    } else if (preserveConflict(output, incoming, ' (sync conflict)')) conflicts++;
  }
  return { items: output, added, updated, conflicts };
}
export const mergeProjects = (local: Project[], remote: Project[]): MergeResult<Project> =>
  mergeNamed(local, remote);
export const mergeAgents = (local: Agent[], remote: Agent[]): MergeResult<Agent> =>
  mergeNamed(local, remote);

export function validateSnapshot(value: unknown): SyncSnapshot {
  const obj = value as Partial<SyncSnapshot> | null;
  if (!obj || obj.version !== 1 || typeof obj.sourceId !== 'string' ||
      !/^[a-zA-Z0-9_-]{8,128}$/.test(obj.sourceId) ||
      !Array.isArray(obj.projects) || !Array.isArray(obj.conversations) || !Array.isArray(obj.agents) ||
      obj.projects.length > 1000 || obj.conversations.length > 20000 || obj.agents.length > 1000) {
    throw new Error('Unsupported or damaged Atlas sync payload.');
  }
  return obj as SyncSnapshot;
}