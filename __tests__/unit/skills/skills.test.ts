import { limitResources, parseSkill, RESOURCE_LIMITS, skillSlug, SkillFormatError } from '../../../src/skills/parseSkill';
import { calledSkill, pickSkill, relevance, skillsNote, skillBudgetChars } from '../../../src/skills/selectSkills';
import type { Skill } from '../../../src/skills/skillsStore';

const claudeStyle = `---
name: Summarize Meeting Notes
description: Turn raw meeting notes into a short summary with decisions and action items. Use when the user pastes meeting notes or asks for minutes.
---

# Steps
1. List the decisions.
2. List action items with an owner.
`;

const openclawStyle = `---
name: weather
description: "Get the current weather and forecast for a city."
user-invocable: false
metadata: {"openclaw":{"requires":{"bins":["curl"]}}}
---
Use curl to fetch the forecast:

\`\`\`bash
curl -s wttr.in/London
\`\`\`
`;

const skill = (over: Partial<Skill> & { name: string; description: string }): Skill =>
  ({ body: 'Do the thing.', userInvocable: true, needs: [], enabled: true, addedAt: 1, ...over });

describe('reading a skill', () => {
  it('reads a Claude style skill: name made into a command, description and the steps', () => {
    const s = parseSkill(claudeStyle);
    expect(s.name).toBe('summarize-meeting-notes');
    expect(s.description).toMatch(/^Turn raw meeting notes/);
    expect(s.body).toMatch(/^# Steps/);
    expect(s.userInvocable).toBe(true);
    expect(s.needs).toEqual([]);
  });

  it('reads an OpenClaw style skill and says what it expects Atlas cannot run', () => {
    const s = parseSkill(openclawStyle);
    expect(s.name).toBe('weather');
    expect(s.description).toBe('Get the current weather and forecast for a city.');
    expect(s.userInvocable).toBe(false);
    expect(s.needs).toEqual(['curl']);
  });

  it('reads a folded multi-line description', () => {
    const s = parseSkill('---\nname: poet\ndescription: >\n  Write short poems\n  about anything.\n---\nWrite a poem.');
    expect(s.description).toBe('Write short poems about anything.');
  });

  it('explains what is missing instead of guessing', () => {
    expect(() => parseSkill('Just some text')).toThrow(SkillFormatError);
    expect(() => parseSkill('---\ndescription: x\n---\nbody')).toThrow(/no name/);
    expect(() => parseSkill('---\nname: x\n---\nbody')).toThrow(/no description/);
    expect(() => parseSkill('---\nname: x\ndescription: y\n---\n')).toThrow(/no instructions/);
    expect(skillSlug('  My Skill!! v2 ')).toBe('my-skill-v2');
  });
});

describe('choosing a skill for a message', () => {
  const notes = skill({ name: 'summarize-meeting-notes', description: 'Turn raw meeting notes into a short summary with decisions and action items.', body: 'List decisions, then action items.' });
  const poems = skill({ name: 'poet', description: 'Write short poems about any subject.' });
  const all = [notes, poems];

  it('picks the skill whose name or description fits the message', () => {
    expect(pickSkill('Can you summarize these meeting notes for me?', all)?.name).toBe('summarize-meeting-notes');
    expect(pickSkill('Please write short poems about the sea', all)?.name).toBe('poet');
    expect(pickSkill('write a short email to my landlord', all)).toBeUndefined(); // two shared words are not enough
  });

  it('uses no skill for an unrelated message, or when the skill is switched off', () => {
    expect(pickSkill('what is the capital of France?', all)).toBeUndefined();
    expect(pickSkill('summarize my meeting notes', [{ ...notes, enabled: false }, poems])).toBeUndefined();
    expect(relevance('hello there', notes)).toBe(0);
  });

  it('calls a skill by name with a slash, but not one that cannot be called that way', () => {
    expect(calledSkill('/poet the moon', all)?.name).toBe('poet');
    expect(pickSkill('/poet hello', all)?.name).toBe('poet'); // even when the words do not match
    expect(calledSkill('/poet hello', [{ ...poems, userInvocable: false }])).toBeUndefined();
    expect(calledSkill('/missing hello', all)).toBeUndefined();
  });

  it('adds the instructions to the prompt, cut to the room a small model has', () => {
    expect(skillsNote('summarize meeting notes', all, 4096)).toContain('SKILL "summarize-meeting-notes"');
    expect(skillsNote('summarize meeting notes', all, 4096)).toContain('List decisions, then action items.');
    expect(skillsNote('capital of France', all, 4096)).toBe('');
    const long = skill({ name: 'long', description: 'Long skill for essays about anything', body: 'x'.repeat(10000) });
    const note = skillsNote('/long essays', [long], 4096);
    expect(note.length).toBeLessThan(skillBudgetChars(4096) + 300);
    expect(note).toMatch(/left out to fit/);
    expect(skillBudgetChars(16384)).toBeGreaterThan(skillBudgetChars(4096));
  });
});

describe('files that come with a skill', () => {
  it('keeps text files within the limits, with plain names, and leaves out scripts, SKILL.md, empty and oversize files', () => {
    const big = 'x'.repeat(RESOURCE_LIMITS.bytesEach + 1);
    const { kept, skipped } = limitResources([
      { name: 'references/api.md', text: 'The API.' }, { name: '/notes.txt', text: 'Notes.' }, { name: 'scripts/run.py', text: 'print(1)' }, { name: 'SKILL.md', text: 'the skill' },
      { name: 'empty.md', text: '  ' }, { name: 'huge.md', text: big }, { name: 'data\\table.csv', text: 'a,b' },
    ]);
    expect(kept.map((r) => r.name)).toEqual(['references/api.md', 'notes.txt', 'data/table.csv']);
    expect(skipped).toBe(4);
    const many = Array.from({ length: 30 }, (_, i) => ({ name: `r${i}.md`, text: 'y'.repeat(20 * 1024) }));
    const limited = limitResources(many).kept;
    expect(limited.length).toBeLessThanOrEqual(RESOURCE_LIMITS.files);
    expect(limited.reduce((n, r) => n + r.text.length, 0)).toBeLessThanOrEqual(RESOURCE_LIMITS.bytesTotal);
  });

  it('gives the reference pieces that match the request, best first and inside the room, and none when nothing matches', () => {
    const { relevantReferences, referencePieces } = require('../../../src/skills/selectSkills');
    const text = '# Returns\n\nA refund for a damaged parcel is paid within five working days.\n\n# Shipping\n\nParcels are sent every Tuesday from the warehouse.';
    expect(referencePieces(text, 80).length).toBeGreaterThan(1);
    const files = [{ name: 'policy.md', text }];
    expect(relevantReferences('refund for a damaged parcel', files, 500)[0]).toMatch(/\[policy\.md\]\n.*refund for a damaged parcel/s);
    expect(relevantReferences('refund for a damaged parcel', files, 40)).toEqual([]); // no room
    expect(relevantReferences('what is the weather', files, 500)).toEqual([]);
  });
});

describe('a skill read as steps', () => {
  const { skillSteps } = require('../../../src/skills/skillSteps');
  it('takes the numbered items (an indented line belongs to its item, a closing paragraph does not), else the sections under headings, else nothing', () => {
    expect(skillSteps('Intro.\n\n1. First thing.\n   more of the first.\n2) Second thing.\n\nA closing note.')).toEqual(['First thing. more of the first.', 'Second thing.']);
    expect(skillSteps('# Title\n\n## Gather\nCollect the facts.\n\nAnd the dates.\n\n## Write\nWrite it up.')).toEqual(['Gather Collect the facts. And the dates.', 'Write Write it up.']);
    expect(skillSteps('Be kind and brief.')).toEqual([]);
    expect(skillSteps('1. Only one step.')).toEqual([]);
    expect(skillSteps(Array.from({ length: 20 }, (_, i) => `${i + 1}. Step ${i + 1}.`).join('\n'))).toHaveLength(12);
  });
});
