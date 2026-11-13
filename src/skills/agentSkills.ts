/**
 * The skills a specialist agent (Accountant, Repair Helper, Home Chef...) works with. They come from the skill library, so
 * they apply the moment the agent is chosen, without the person adding each one under Skills first.
 */
import { useAgentStore } from '../stores/agentStore';
import { SKILL_LIBRARY } from './library';
import { useSkills, type Skill } from './skillsStore';

/** Names of the skills this agent specialises in (none for an ordinary agent). */
export const agentSkillNames = (agentId: string | null | undefined): string[] =>
  (agentId ? useAgentStore.getState().getAgent(agentId)?.skills : undefined) ?? [];

/** The installed skills, plus the agent's own library skills that are not installed yet (those are always on). */
export function skillsFor(agentId: string | null | undefined): Skill[] {
  const installed = useSkills.getState().skills;
  const own = agentSkillNames(agentId)
    .filter((name) => !installed.some((s) => s.name === name))
    .flatMap((name) => SKILL_LIBRARY.filter((l) => l.name === name))
    .map((l): Skill => ({ ...l, enabled: true, addedAt: 0 }));
  return [...installed, ...own];
}
