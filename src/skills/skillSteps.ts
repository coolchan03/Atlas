/**
 * A skill run in steps. A long skill does not fit a small model's memory whole (see skillBudgetChars), and a model given everything at once
 * skips or muddles parts. A skill written as steps (a numbered list, or sections under headings) is split at those steps; each step is then
 * done on its own with only that step, the result of the one before and the parts of the skill's reference files it is about.
 * Pure, so it is tested without a device.
 */
import type { Skill } from './skillsStore';

const MAX_STEPS = 12;
const MAX_STEP_CHARS = 600;

/**
 * Groups lines under the lines that start a step. A line after a start belongs to that step until a heading, or (for a list) until a blank line
 * followed by a line that is not indented; text under a heading belongs to it until the next heading.
 */
function group(lines: string[], starts: (line: string) => boolean, sections: boolean): string[] {
  const out: string[] = [];
  let open = false;
  let blank = false;
  for (const line of lines) {
    if (starts(line)) { out.push(line.trim()); open = true; blank = false; continue; }
    if (/^#{1,6}\s/.test(line)) { open = false; continue; }
    if (!line.trim()) { blank = true; continue; }
    if (open && (sections || !blank || /^\s/.test(line))) out[out.length - 1] = `${out[out.length - 1]} ${line.trim()}`;
    else open = false;
  }
  return out;
}

/** The steps of a skill's instructions: the numbered items if there are at least two, else the sections under headings; empty when there are none. */
export function skillSteps(body: string): string[] {
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  const numbered = group(lines, (l) => /^\s{0,3}\d{1,2}[.)]\s+\S/.test(l), false).map((t) => t.replace(/^\d{1,2}[.)]\s+/, ''));
  const picked = numbered.length >= 2 ? numbered : group(lines, (l) => /^#{2,4}\s+\S/.test(l), true).map((t) => t.replace(/^#{2,4}\s+/, ''));
  return picked.length >= 2 ? picked.slice(0, MAX_STEPS).map((t) => t.replace(/\s+/g, ' ').slice(0, MAX_STEP_CHARS)) : [];
}

/** The id the skill's job has among the helpers' jobs (a helper's job id is its id with `custom-` in front). */
export const skillJobId = (name: string): string => `custom-skill-${name}`;

/** The skill as a helper the step runner can run, or null when it has fewer than two steps. */
export function skillHelper(skill: Skill): { id: string; title: string; summary: string; help: string; steps: string; createdAt: number; resources?: Skill['resources'] } | null {
  const steps = skillSteps(skill.body);
  if (steps.length < 2) return null;
  return {
    id: `skill-${skill.name}`, title: `/${skill.name}`, summary: skill.description, help: `Paste or type what the ${skill.name} skill should work on.`,
    steps: steps.map((s, i) => `${i + 1}. ${s}`).join('\n'), createdAt: skill.addedAt, resources: skill.resources,
  };
}
