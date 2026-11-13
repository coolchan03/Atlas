import { DEFAULT_AGENTS } from '../../src/stores/agentStore';
import { SKILL_LIBRARY } from '../../src/skills/library';
import { skillsNote } from '../../src/skills/selectSkills';
import type { Skill } from '../../src/skills/skillsStore';

const library = (): Skill[] => SKILL_LIBRARY.map((s) => ({ ...s, enabled: true, addedAt: 0 }));
const agent = (id: string) => DEFAULT_AGENTS.find((a) => a.id === id)!;

describe('specialist agents and the skills they work with', () => {
  it('every specialist names skills that exist in the library', () => {
    const names = new Set(SKILL_LIBRARY.map((s) => s.name));
    for (const id of ['accountant', 'repair-helper', 'home-chef', 'paperwork-reader', 'meeting-secretary']) {
      expect(agent(id).skills?.length).toBeGreaterThan(0);
      for (const skill of agent(id).skills!) expect(names.has(skill)).toBe(true);
    }
  });
  it('an agent with one specialty always works that way, even on a short message', () => {
    expect(skillsNote('here it is', library(), { contextTokens: 4096, specialist: agent('home-chef').skills })).toContain('SKILL "dinner-from-what-i-have"');
    expect(skillsNote('here it is', library(), { contextTokens: 4096, specialist: agent('repair-helper').skills })).toContain('SKILL "repair-helper"');
  });
  it('an agent with several picks the one that fits the message', () => {
    const skills = agent('paperwork-reader').skills;
    expect(skillsNote('Can you read this lease agreement and list the cancellation terms?', library(), { contextTokens: 4096, specialist: skills })).toContain('SKILL "contract-reader"');
    expect(skillsNote('Explain this letter from the tax office', library(), { contextTokens: 4096, specialist: skills })).toContain('SKILL "explain-this-letter"');
    expect(skillsNote('hello', library(), { contextTokens: 4096, specialist: skills })).toBe(''); // nothing forced when it is not clear
  });
  it('the accountant works from the bank statement skill, which insists on checking the arithmetic', () => {
    const note = skillsNote('Here is my bank statement for March, please turn it into a CSV', library(), { contextTokens: 4096, specialist: agent('accountant').skills });
    expect(note).toContain('SKILL "bank-statement-to-csv"');
    expect(note).toMatch(/opening balance \+ the sum of all amounts must equal the closing balance/);
  });
  it('an ordinary agent is not forced into any skill', () => {
    expect(skillsNote('hi there', library(), { contextTokens: 4096, specialist: [] })).toBe('');
  });
});
