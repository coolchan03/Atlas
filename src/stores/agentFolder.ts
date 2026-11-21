/** The project folder an agent brings to its chats, when it has one that still exists. */
export function agentProjectFolder(agentId: string | null | undefined): string | undefined {
  const folder: string | undefined = agentId ? require('./agentStore').useAgentStore.getState().getAgent(agentId)?.projectId : undefined;
  return folder && require('./projectStore').useProjectStore.getState().getProject(folder) ? folder : undefined;
}
