/**
 * What a project decides for the chats inside it: the agent a new chat starts with, and whether answers are kept short. Pure, so the
 * rules are tested without screens. chatStore applies the agent when a chat is created; agentStore applies the cap on each reply.
 */
import type { Project } from '../types';

/** Longest answer, in tokens, in a project set to short answers. */
export const SHORT_ANSWER_TOKENS = 256;

/** The project's default agent when it still exists, else undefined (a deleted agent never leaves a chat pointing at nothing). */
export function defaultAgentFor(project: Pick<Project, 'defaultAgentId'> | undefined, agentIds: string[]): string | undefined {
  const id = project?.defaultAgentId;
  return id && agentIds.includes(id) ? id : undefined;
}

/** The token cap a project puts on answers, or undefined for no cap. */
export function answerCapFor(project: Pick<Project, 'answerLength'> | undefined): number | undefined {
  return project?.answerLength === 'short' ? SHORT_ANSWER_TOKENS : undefined;
}
