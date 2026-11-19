import { isPal, DEFAULT_AGENTS } from '../../src/stores/agentStore';

describe('agents and pals', () => {
  it('Friend and Jake are pals; the working agents are not', () => {
    const pals = DEFAULT_AGENTS.filter(isPal).map((a) => a.id).sort();
    expect(pals).toEqual(['friend', 'girlfriend', 'jock-boyfriend', 'mentor']);
    expect(isPal(DEFAULT_AGENTS.find((a) => a.id === 'writer')!)).toBe(false);
  });
  it('an agent saved before pals existed keeps working: the shipped two count as pals by id', () => {
    expect(isPal({ id: 'friend' })).toBe(true);
    expect(isPal({ id: 'my-own' })).toBe(false);
  });
  it('an explicit kind wins', () => {
    expect(isPal({ id: 'friend', kind: 'agent' })).toBe(false);
    expect(isPal({ id: 'custom', kind: 'pal' })).toBe(true);
  });
});

describe('specialists and the dropped agents', () => {
  it('the cook, the accountant and the paperwork reader are hidden specialists; the plain Teacher, Assistant and Secretary are gone; one Assistant remains', () => {
    const { isHiddenAgent } = require('../../src/stores/agentStore');
    for (const id of ['home-chef', 'accountant', 'paperwork-reader']) expect(isHiddenAgent(DEFAULT_AGENTS.find((a) => a.id === id)!)).toBe(true);
    expect(DEFAULT_AGENTS.some((a) => ['teacher', 'assistant', 'meeting-secretary'].includes(a.id))).toBe(false);
    expect(DEFAULT_AGENTS.filter((a) => a.name === 'Assistant')).toHaveLength(1);
    expect(DEFAULT_AGENTS.find((a) => a.id === 'home-chef')!.systemPrompt).toMatch(/165 F \(74 C\)/);
  });
});
