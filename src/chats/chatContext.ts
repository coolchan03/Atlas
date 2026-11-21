/**
 * "What is this chat using?": the real state, read from the stores, never guessed. A protected chat or project shows no name, and a
 * private chat says it is not saved. Pure core (`describeChatContext`) plus a reader that gathers the inputs.
 */
import type { Conversation } from '../types';

export interface ChatContextInput {
  locked: boolean; privateChat: boolean;
  projectName?: string; projectLocked?: boolean;
  model?: { name: string; remote: boolean; loaded: boolean };
  agentName?: string; toolIds: string[]; offGrid: boolean;
  /** Tools run for this turn only by automatic routing (none are added today). */
  routedThisTurn?: string[];
}

export function describeChatContext(c: ChatContextInput): string[] {
  const lines: string[] = [];
  lines.push(c.privateChat ? 'Private chat: not saved, gone when the app closes.' : c.locked ? 'Locked chat: protected with its own PIN.' : 'Saved chat.');
  lines.push(c.projectName === undefined ? 'Project: none' : `Project: ${c.projectLocked || c.locked ? 'protected (name hidden)' : c.projectName}`);
  if (!c.model) lines.push('Model: none selected');
  else lines.push(`Model: ${c.locked ? 'in use' : c.model.name}, ${c.model.remote ? 'on a remote server (text leaves this phone)' : 'on this phone'}${c.model.loaded || c.model.remote ? '' : ' (selected, not loaded yet)'}`);
  lines.push(c.agentName ? `Character: ${c.agentName} (your choice, not changed automatically)` : 'Character: none');
  lines.push(c.toolIds.length ? `Tools on: ${c.toolIds.join(', ')}` : 'Tools on: none');
  lines.push(c.offGrid ? 'Off-grid: on, no internet tools' : 'Off-grid: off');
  if (c.routedThisTurn?.length) lines.push(`Added for this turn only: ${c.routedThisTurn.join(', ')}`);
  return lines;
}

/** Reads the live stores for one conversation. */
export function chatContextFor(conv: Conversation): string[] {
  const { useAppStore } = require('../stores/appStore'); // NOSONAR: loaded lazily to keep this module cheap to import
  const { useProjectStore } = require('../stores/projectStore');
  const { useAgentStore } = require('../stores/agentStore');
  const { toolsForConversation } = require('../services/tools/chatTools');
  const { offGridOn } = require('../atlasTools/offGridState');
  const app = useAppStore.getState();
  const project = conv.projectId ? useProjectStore.getState().projects.find((p: any) => p.id === conv.projectId) : undefined;
  const agent = conv.agentId ? useAgentStore.getState().agents.find((a: any) => a.id === conv.agentId) : undefined;
  const local = app.downloadedModels.find((m: any) => m.id === app.activeModelId);
  const remoteId: string | null = require('../stores/remoteServerStore').useRemoteServerStore.getState().activeRemoteTextModelId;
  const remote = remoteId ? { name: remoteId, remote: true, loaded: true } : undefined;
  return describeChatContext({
    locked: !!conv.pinVerifier, privateChat: !!conv.isPrivate,
    projectName: project ? project.name : undefined, projectLocked: !!(project?.pinVerifier || project?.protectedBlob),
    model: remote ?? (local ? { name: local.name, remote: false, loaded: app.loadedTextModelId === local.id } : undefined),
    agentName: agent?.name, toolIds: toolsForConversation(conv), offGrid: offGridOn(), routedThisTurn: require('../services/tools/specialistRouting').routedForTurn(conv.id),
  });
}
